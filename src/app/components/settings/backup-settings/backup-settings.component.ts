import { Component, signal } from '@angular/core';
import {
  AutoBackupService,
  BACKUP_EXTENSION,
  BackupService,
  GoogleDriveService,
  IDriveBackup,
  ShareService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';

@Component({
  selector: 'app-backup-settings',
  imports: [CustomElementModule],
  templateUrl: './backup-settings.component.html',
  styleUrl: './backup-settings.component.scss',
})
export class BackupSettingsComponent {
  readonly extension = BACKUP_EXTENSION;
  readonly driveBackups = signal<IDriveBackup[] | null>(null);
  readonly busy = signal(false);
  readonly origin = location.origin;

  constructor(
    protected drive: GoogleDriveService,
    protected autoBackup: AutoBackupService,
    private backupService: BackupService,
    private share: ShareService,
    private toasters: ToastersService,
  ) {}

  async connect(): Promise<void> {
    try {
      const email = await this.drive.connect();
      this.toasters.success('Connected to Google Drive: ' + email);
      await this.autoBackup.backupNow();
    } catch (err) {
      this.toasters.error('Could not connect: ' + (err as Error).message);
    }
  }

  disconnect(): void {
    if (!confirm('Stop backing up to this Google account? Old backups stay in its Drive.')) return;
    this.drive.disconnect();
    this.driveBackups.set(null);
    this.toasters.info('Google Drive disconnected');
  }

  async shareFile(): Promise<void> {
    await this.run(async () => {
      const { blob, name } = await this.backupService.createBackup();
      await this.share.shareFile(new File([blob], name, { type: 'application/gzip' }), name);
    });
  }

  async loadDriveBackups(): Promise<void> {
    await this.run(async () => {
      if (!this.drive.hasValidToken()) await this.drive.connect();
      this.driveBackups.set(await this.drive.list());
    });
  }

  async restoreFromDrive(file: IDriveBackup): Promise<void> {
    await this.run(async () => this.restore(await this.drive.download(file.id)));
  }

  async restoreFromFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.run(async () => this.restore(file));
  }

  // Shows what the backup holds, then replaces all data on this device and reloads the app
  private async restore(file: Blob): Promise<void> {
    const backup = await this.backupService.readBackup(file);
    const when = new Date(backup.createdAt).toLocaleString('en-IN');
    const bills = backup.counts['bills'] ?? 0;
    const customers = backup.counts['customers'] ?? 0;
    const products = backup.counts['products'] ?? 0;
    const message =
      `Restore backup of "${backup.shopName}" from ${when}?\n\n` +
      `${products} products, ${customers} customers, ${bills} bills.\n\n` +
      'ALL data on this device will be replaced by this backup.';
    if (!confirm(message)) return;
    await this.backupService.restore(backup);
    try {
      localStorage.removeItem('pos.billDraft');
    } catch {}
    this.toasters.success('Backup restored. Reloading...');
    setTimeout(() => location.reload(), 800);
  }

  size(bytes: number): string {
    return bytes > 1024 * 1024
      ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
      : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await work();
    } catch (err) {
      this.toasters.error((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
