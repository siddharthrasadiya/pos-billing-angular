import { Injectable, signal } from '@angular/core';
import { BackupService } from './backup.service';
import { GoogleDriveService } from './google-drive.service';
import { ToastersService } from './toasters.service';

const SETTINGS_KEY = 'pos.backup';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// While the app stays open: back up every hour and after every 10 issued bills
const OPEN_EVERY_MS = HOUR_MS;
const EVERY_BILLS = 10;
const CHECK_EVERY_MS = 5 * 60 * 1000;

interface IBackupSettings {
  auto: boolean;
  lastAt: string | null;
  billsSince: number;
}

// Kept per device (localStorage), like the default printer: it describes this phone's backups
function readSettings(): IBackupSettings {
  try {
    return {
      auto: true,
      lastAt: null,
      billsSince: 0,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'),
    };
  } catch {
    return { auto: true, lastAt: null, billsSince: 0 };
  }
}

// Automatic Google Drive backups: once a day when the app opens, then every hour while it stays
// open and after every 10 bills. With a fresh Google key the backup runs silently; when Google
// needs the owner again a one-tap banner asks for it (a website cannot renew the key unnoticed)
@Injectable({
  providedIn: 'root',
})
export class AutoBackupService {
  readonly auto = signal(readSettings().auto);
  readonly lastAt = signal<string | null>(readSettings().lastAt);
  readonly running = signal(false);
  // A backup is due but needs one tap, because the Google key has expired
  readonly needsTap = signal(false);
  private billsSince = readSettings().billsSince;
  private started = false;

  constructor(
    private backupService: BackupService,
    private drive: GoogleDriveService,
    private toasters: ToastersService,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.check(DAY_MS);
    setInterval(() => this.check(OPEN_EVERY_MS), CHECK_EVERY_MS);
  }

  setAuto(auto: boolean): void {
    this.auto.set(auto);
    if (!auto) this.needsTap.set(false);
    this.save();
  }

  noteBillIssued(): void {
    this.billsSince++;
    this.save();
    if (this.billsSince >= EVERY_BILLS) this.runAutomatic();
  }

  // From a tap (Settings, or the banner): may open Google's window to renew the key
  async backupNow(): Promise<boolean> {
    if (this.running()) return false;
    this.running.set(true);
    try {
      if (!this.drive.hasValidToken()) await this.drive.connect();
      await this.upload();
      this.toasters.success('Backed up to Google Drive (' + this.drive.account() + ')');
      return true;
    } catch (err) {
      this.toasters.error('Backup failed: ' + (err as Error).message);
      return false;
    } finally {
      this.running.set(false);
    }
  }

  dismiss(): void {
    this.needsTap.set(false);
  }

  private check(maxAge: number): void {
    const last = this.lastAt();
    if (!last || Date.now() - new Date(last).getTime() >= maxAge) this.runAutomatic();
  }

  private async runAutomatic(): Promise<void> {
    if (!this.auto() || !this.drive.isConfigured || !this.drive.account() || this.running()) {
      return;
    }
    if (!this.drive.hasValidToken()) {
      this.needsTap.set(true);
      return;
    }
    this.running.set(true);
    try {
      await this.upload();
    } catch {
      this.needsTap.set(true);
    } finally {
      this.running.set(false);
    }
  }

  private async upload(): Promise<void> {
    const { blob, name } = await this.backupService.createBackup();
    await this.drive.upload(blob, name);
    this.lastAt.set(new Date().toISOString());
    this.billsSince = 0;
    this.needsTap.set(false);
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ auto: this.auto(), lastAt: this.lastAt(), billsSince: this.billsSince }),
      );
    } catch {}
  }
}
