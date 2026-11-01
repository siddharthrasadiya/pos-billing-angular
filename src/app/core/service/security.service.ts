import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DbStore } from '../enums/db-store.enum';
import { DatabaseService } from './database.service';

export const PIN_LENGTH = 4;
// Kept in the Settings store, so it travels with backups to a new phone
const SECURITY_ID = 'security';
const UNLOCK_MS = 5 * 60 * 1000;
const MAX_TRIES = 5;
const WAIT_MS = 30 * 1000;
const RECOVERY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface ISecurityRecord {
  id: string;
  salt: string;
  pinHash: string;
  recoveryHash: string;
  updatedAt: string;
}

export interface IPinPrompt {
  reason: string;
  resolve: (allowed: boolean) => void;
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomText(length: number, chars: string): string {
  return [...crypto.getRandomValues(new Uint32Array(length))]
    .map((n) => chars[n % chars.length])
    .join('');
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Owner PIN: with a PIN set, changing or deleting data asks for it. Once entered, the app stays
// unlocked for 5 minutes after the last protected action, or until it is locked or put away.
// It keeps staff and children out; it is not protection against someone with developer tools
@Injectable({
  providedIn: 'root',
})
export class SecurityService {
  readonly hasPin = signal(false);
  readonly unlocked = signal(false);
  readonly prompt = signal<IPinPrompt | null>(null);
  private record: ISecurityRecord | null = null;
  private readonly ready: Promise<void>;
  private lockTimer?: ReturnType<typeof setTimeout>;
  private wrongTries = 0;
  private waitUntil = 0;

  constructor(private db: DatabaseService) {
    this.ready = this.load();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.lock();
    });
  }

  needsPin(): boolean {
    return this.hasPin() && !this.unlocked();
  }

  // Resolves true when there is no PIN, the app is unlocked, or the right PIN is entered
  async allow(reason: string): Promise<boolean> {
    await this.ready;
    if (!this.record || this.unlocked()) {
      if (this.record) this.keepUnlocked();
      return true;
    }
    this.prompt()?.resolve(false);
    return new Promise((resolve) => this.prompt.set({ reason, resolve }));
  }

  // Error text to show, or null when the PIN was right
  async enterPin(pin: string): Promise<string | null> {
    if (!this.record) return null;
    const wait = this.waitText();
    if (wait) return wait;
    if ((await sha256(this.record.salt + pin)) === this.record.pinHash) {
      this.wrongTries = 0;
      this.unlock();
      this.finishPrompt(true);
      return null;
    }
    return this.wrongTry('Wrong PIN');
  }

  // The recovery code removes the PIN; the owner sets a new one in Settings
  async useRecoveryCode(code: string): Promise<string | null> {
    if (!this.record) return null;
    const wait = this.waitText();
    if (wait) return wait;
    if ((await sha256(this.record.salt + normalizeCode(code))) !== this.record.recoveryHash) {
      return this.wrongTry('Wrong recovery code');
    }
    this.wrongTries = 0;
    await this.removePin();
    this.finishPrompt(true);
    return null;
  }

  cancelPrompt(): void {
    this.finishPrompt(false);
  }

  // Returns the new recovery code, shown once for the owner to write down
  async setPin(pin: string): Promise<string> {
    const code = randomText(8, RECOVERY_CHARS);
    const salt = randomText(16, RECOVERY_CHARS);
    const record: ISecurityRecord = {
      id: SECURITY_ID,
      salt,
      pinHash: await sha256(salt + pin),
      recoveryHash: await sha256(salt + code),
      updatedAt: new Date().toISOString(),
    };
    await firstValueFrom(this.db.put(DbStore.Settings, record));
    this.record = record;
    this.hasPin.set(true);
    this.unlock();
    return code.slice(0, 4) + '-' + code.slice(4);
  }

  async removePin(): Promise<void> {
    await firstValueFrom(this.db.delete(DbStore.Settings, SECURITY_ID));
    this.record = null;
    this.hasPin.set(false);
    this.lock();
  }

  lock(): void {
    clearTimeout(this.lockTimer);
    this.unlocked.set(false);
  }

  private async load(): Promise<void> {
    this.record =
      (await firstValueFrom(this.db.get<ISecurityRecord>(DbStore.Settings, SECURITY_ID))) ?? null;
    this.hasPin.set(!!this.record);
  }

  private unlock(): void {
    this.unlocked.set(true);
    this.keepUnlocked();
  }

  private keepUnlocked(): void {
    clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => this.lock(), UNLOCK_MS);
  }

  private finishPrompt(allowed: boolean): void {
    const prompt = this.prompt();
    this.prompt.set(null);
    prompt?.resolve(allowed);
  }

  private waitText(): string | null {
    const seconds = Math.ceil((this.waitUntil - Date.now()) / 1000);
    return seconds > 0 ? `Too many wrong tries. Try again in ${seconds} seconds` : null;
  }

  private wrongTry(message: string): string {
    if (++this.wrongTries < MAX_TRIES) return message;
    this.wrongTries = 0;
    this.waitUntil = Date.now() + WAIT_MS;
    return this.waitText()!;
  }
}
