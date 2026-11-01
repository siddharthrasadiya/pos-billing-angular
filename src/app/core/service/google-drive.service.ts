import { Injectable, signal } from '@angular/core';
import { GOOGLE_CLIENT_ID } from '../constants/app.constant';

// drive.file = only files this app creates; the app never sees anything else in the owner's Drive
const SCOPES =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const FOLDER_NAME = 'POS Billing Backups';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const KEEP_BACKUPS = 30;
const ACCOUNT_KEY = 'pos.driveAccount';
// Treat the token as expired a little early, so an upload never starts with a dying token
const EXPIRY_MARGIN_MS = 60 * 1000;

export interface IDriveBackup {
  id: string;
  name: string;
  createdTime: string;
  size: number;
}

interface ITokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface ITokenClient {
  requestAccessToken(options: { prompt?: string; login_hint?: string }): void;
}

interface IGoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: ITokenResponse) => void;
        error_callback?: (error: { type: string }) => void;
      }): ITokenClient;
      revoke(token: string, done: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: IGoogleIdentity;
  }
}

// Backups go to the shop owner's own Google Drive: they sign in with their Google account in
// Google's window, and the app gets a short-lived key (about 1 hour) to save files there.
// A website without its own server cannot keep that key longer, so when it has expired the
// owner taps once to renew it (no password again once they have agreed the first time)
@Injectable({
  providedIn: 'root',
})
export class GoogleDriveService {
  readonly isConfigured = !!GOOGLE_CLIENT_ID;
  // Google account backups go to; remembered on this device only
  readonly account = signal<string | null>(readAccount());
  private token: { value: string; expiresAt: number } | null = null;
  private folderId: string | null = null;
  private scriptLoaded?: Promise<void>;

  hasValidToken(): boolean {
    return !!this.token && this.token.expiresAt - EXPIRY_MARGIN_MS > Date.now();
  }

  // Must run from a tap: it may open Google's window
  async connect(): Promise<string> {
    await this.loadScript();
    const response = await new Promise<ITokenResponse>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: resolve,
        error_callback: (error) =>
          reject(
            new Error(error.type === 'popup_closed' ? 'Google window was closed' : error.type),
          ),
      });
      const known = this.account();
      client.requestAccessToken(known ? { prompt: '', login_hint: known } : { prompt: 'consent' });
    });
    if (!response.access_token) throw new Error(response.error || 'Google did not allow access');
    this.token = {
      value: response.access_token,
      expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
    };
    const email = await this.fetchEmail();
    this.account.set(email);
    try {
      localStorage.setItem(ACCOUNT_KEY, email);
    } catch {}
    return email;
  }

  disconnect(): void {
    const token = this.token?.value;
    if (token && window.google) window.google.accounts.oauth2.revoke(token, () => undefined);
    this.token = null;
    this.folderId = null;
    this.account.set(null);
    try {
      localStorage.removeItem(ACCOUNT_KEY);
    } catch {}
  }

  async upload(blob: Blob, name: string): Promise<IDriveBackup> {
    const folder = await this.ensureFolder();
    const metadata = { name, parents: [folder], mimeType: 'application/gzip' };
    const body = new FormData();
    body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    body.append('file', blob);
    const file = await this.request<IDriveBackup>(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size',
      { method: 'POST', body },
    );
    await this.removeOldBackups();
    return file;
  }

  async list(): Promise<IDriveBackup[]> {
    const folder = await this.ensureFolder();
    const query = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const result = await this.request<{ files: IDriveBackup[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime,size)`,
    );
    return result.files.map((f) => ({ ...f, size: Number(f.size) || 0 }));
  }

  async download(id: string): Promise<Blob> {
    const response = await this.fetchWithToken(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    );
    return response.blob();
  }

  private async removeOldBackups(): Promise<void> {
    const files = await this.list();
    for (const file of files.slice(KEEP_BACKUPS)) {
      await this.fetchWithToken(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: 'DELETE',
      });
    }
  }

  private async ensureFolder(): Promise<string> {
    if (this.folderId) return this.folderId;
    const query = encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    );
    const found = await this.request<{ files: { id: string }[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`,
    );
    this.folderId =
      found.files[0]?.id ??
      (
        await this.request<{ id: string }>('https://www.googleapis.com/drive/v3/files?fields=id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
        })
      ).id;
    return this.folderId;
  }

  private async fetchEmail(): Promise<string> {
    const info = await this.request<{ email?: string }>(
      'https://www.googleapis.com/oauth2/v3/userinfo',
    );
    return info.email ?? 'Google account';
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    return (await this.fetchWithToken(url, init)).json() as Promise<T>;
  }

  private async fetchWithToken(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.hasValidToken()) throw new Error('Google Drive needs you to connect again');
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token!.value}` },
    });
    if (response.status === 401) {
      this.token = null;
      throw new Error('Google Drive needs you to connect again');
    }
    if (!response.ok) throw new Error(`Google Drive error ${response.status}`);
    return response;
  }

  private loadScript(): Promise<void> {
    this.scriptLoaded ??= new Promise((resolve, reject) => {
      if (window.google?.accounts) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.scriptLoaded = undefined;
        reject(new Error('Could not reach Google. Check the internet connection.'));
      };
      document.head.appendChild(script);
    });
    return this.scriptLoaded;
  }
}

function readAccount(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_KEY);
  } catch {
    return null;
  }
}
