import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DB_VERSION, SHOP_SETTINGS_ID } from '../constants/db.constant';
import { DbStore } from '../enums/db-store.enum';
import customDatetime from '../shared/custom-elements/custom-datetime.pipe';
import { DatabaseService, idbRequest } from './database.service';

const BACKUP_APP = 'pos-billing';
export const BACKUP_EXTENSION = '.posbak';
const ALL_STORES = Object.values(DbStore);

export interface IBackupInfo {
  createdAt: string;
  shopName: string;
  // Rows per store, shown before a restore so the owner knows what comes back
  counts: Record<string, number>;
}

interface IBackupFile extends IBackupInfo {
  app: string;
  version: number;
  data: Record<string, unknown[]>;
}

// One file holds the whole database, gzip-compressed (a year of bills is a few MB as text and a
// small fraction of that zipped). A restore replaces everything in one transaction
@Injectable({
  providedIn: 'root',
})
export class BackupService {
  constructor(private db: DatabaseService) {}

  async createBackup(): Promise<{ blob: Blob; name: string; info: IBackupInfo }> {
    const data = await firstValueFrom(
      this.db.transaction(ALL_STORES, 'readonly', async (tx) => {
        const result: Record<string, unknown[]> = {};
        for (const store of ALL_STORES) {
          result[store] = await idbRequest<unknown[]>(tx.objectStore(store).getAll());
        }
        return result;
      }),
    );
    const settings = data[DbStore.Settings] as { id: string; name?: string }[];
    const shop = settings.find((s) => s.id === SHOP_SETTINGS_ID)?.name ?? '';
    const info: IBackupInfo = {
      createdAt: new Date().toISOString(),
      shopName: shop,
      counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    };
    const file: IBackupFile = { app: BACKUP_APP, version: DB_VERSION, ...info, data };
    const blob = await gzip(JSON.stringify(file));
    return { blob, name: backupFileName(shop, info.createdAt), info };
  }

  async readBackup(file: Blob): Promise<IBackupFile> {
    let parsed: IBackupFile;
    try {
      parsed = JSON.parse(await gunzip(file));
    } catch {
      throw new Error('This is not a POS Billing backup file');
    }
    if (parsed.app !== BACKUP_APP || !parsed.data) {
      throw new Error('This is not a POS Billing backup file');
    }
    if (parsed.version !== DB_VERSION) {
      throw new Error(
        `This backup is from another app version (${parsed.version}, this app is ${DB_VERSION}). ` +
          'Update the app on both devices first.',
      );
    }
    return parsed;
  }

  // Everything on this device is replaced by the backup, all or nothing
  async restore(backup: IBackupFile): Promise<void> {
    await firstValueFrom(
      this.db.transaction(ALL_STORES, 'readwrite', async (tx) => {
        for (const store of ALL_STORES) {
          const objectStore = tx.objectStore(store);
          await idbRequest(objectStore.clear());
          for (const row of backup.data[store] ?? []) await idbRequest(objectStore.add(row));
        }
      }),
    );
  }
}

function backupFileName(shop: string, createdAt: string): string {
  const safeShop = shop.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'Shop';
  const when = customDatetime(createdAt, { format: 'YYYY-MM-DD_HH-mm' });
  return `POS-Backup-${safeShop}-${when}${BACKUP_EXTENSION}`;
}

async function gzip(text: string): Promise<Blob> {
  const plain = new Blob([text], { type: 'application/json' });
  if (typeof CompressionStream === 'undefined') return plain;
  const stream = plain.stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
}

// Plain JSON is accepted too (backups from browsers without compression)
async function gunzip(file: Blob): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return file.text();
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
