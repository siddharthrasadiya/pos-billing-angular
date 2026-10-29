import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { DB_NAME, DB_VERSION, SHOP_SETTINGS_ID } from '../constants/db.constant';
import {
  DEFAULT_SHOP_SETTINGS,
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
} from '../constants/demo-data.constant';
import { DbStore } from '../enums/db-store.enum';
import { stamp } from '../helpers/entity.helper';

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private connection?: Promise<IDBDatabase>;

  // Resolves only after the transaction commits, so callers never see half-saved data
  transaction<R>(
    stores: DbStore[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => Promise<R>,
  ): Observable<R> {
    return defer(async () => {
      const db = await this.open();
      return new Promise<R>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        let result: R;
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error ?? new Error('Database transaction cancelled'));
        work(tx).then(
          (value) => (result = value),
          (error) => {
            reject(error);
            try {
              tx.abort();
            } catch {}
          },
        );
      });
    });
  }

  getAll<T>(store: DbStore): Observable<T[]> {
    return this.transaction([store], 'readonly', (tx) =>
      idbRequest(tx.objectStore(store).getAll() as IDBRequest<T[]>),
    );
  }

  get<T>(store: DbStore, id: string): Observable<T | undefined> {
    return this.transaction([store], 'readonly', (tx) =>
      idbRequest(tx.objectStore(store).get(id) as IDBRequest<T | undefined>),
    );
  }

  put<T>(store: DbStore, record: T): Observable<T> {
    return this.transaction([store], 'readwrite', async (tx) => {
      await idbRequest(tx.objectStore(store).put(record));
      return record;
    });
  }

  delete(store: DbStore, id: string): Observable<void> {
    return this.transaction([store], 'readwrite', async (tx) => {
      await idbRequest(tx.objectStore(store).delete(id));
    });
  }

  private open(): Promise<IDBDatabase> {
    this.connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) =>
        this.upgrade(request.result, request.transaction!, event.oldVersion);
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading or deleting the database closes this connection; reopen on next use
        db.onversionchange = () => {
          db.close();
          this.connection = undefined;
        };
        db.onclose = () => (this.connection = undefined);
        navigator.storage?.persist?.();
        resolve(db);
      };
      request.onerror = () => {
        this.connection = undefined;
        reject(request.error);
      };
    });
    return this.connection;
  }

  // Each block upgrades one schema version, so an old database replays every step in order
  private upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
    if (oldVersion < 1) {
      db.createObjectStore(DbStore.Categories, { keyPath: 'id' });
      db.createObjectStore(DbStore.Products, { keyPath: 'id' }).createIndex('categoryId', 'categoryId');
      const bills = db.createObjectStore(DbStore.Bills, { keyPath: 'id' });
      bills.createIndex('no', 'no', { unique: true });
      bills.createIndex('date', 'date');
      db.createObjectStore(DbStore.BillItems, { keyPath: 'id' }).createIndex('billId', 'billId');
      db.createObjectStore(DbStore.Settings, { keyPath: 'id' });
      this.seed(tx);
    }
  }

  private seed(tx: IDBTransaction): void {
    const categories = DEMO_CATEGORIES.map((name) => stamp({ name }));
    categories.forEach((c) => tx.objectStore(DbStore.Categories).put(c));
    DEMO_PRODUCTS.forEach(({ category, ...product }) =>
      tx.objectStore(DbStore.Products).put(stamp({ ...product, categoryId: categories[category].id })),
    );
    tx.objectStore(DbStore.Settings).put(stamp(DEFAULT_SHOP_SETTINGS, { id: SHOP_SETTINGS_ID }));
  }
}
