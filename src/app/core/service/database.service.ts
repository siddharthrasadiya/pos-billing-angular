import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { DB_NAME, DB_VERSION, SHOP_SETTINGS_ID } from '../constants/db.constant';
import {
  DEFAULT_SHOP_SETTINGS,
  DEMO_CATEGORIES,
  DEMO_CUSTOMER_CATEGORIES,
  DEMO_CUSTOMERS,
  DEMO_PRODUCTS,
} from '../constants/demo-data.constant';
import { BillStatus, DiscountType } from '../enums/bill-status.enum';
import { DbStore } from '../enums/db-store.enum';
import { stamp } from '../helpers/entity.helper';

const DB_SCHEMA: { store: DbStore; indexes: [string, boolean][] }[] = [
  { store: DbStore.Categories, indexes: [] },
  { store: DbStore.Products, indexes: [['categoryId', false]] },
  { store: DbStore.CustomerCategories, indexes: [] },
  { store: DbStore.Customers, indexes: [['categoryId', false]] },
  {
    store: DbStore.Bills,
    indexes: [
      ['no', true],
      ['date', false],
      ['customerId', false],
    ],
  },
  { store: DbStore.BillItems, indexes: [['billId', false]] },
  { store: DbStore.Settings, indexes: [] },
];

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

  // Creates whatever stores or indexes are missing instead of trusting the stored version number,
  // so a database left half-upgraded (for example by a reload mid-deploy) repairs itself
  private upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
    const created = new Set<DbStore>();
    for (const { store, indexes } of DB_SCHEMA) {
      if (!db.objectStoreNames.contains(store)) {
        db.createObjectStore(store, { keyPath: 'id' });
        created.add(store);
      }
      const objectStore = tx.objectStore(store);
      for (const [name, unique] of indexes) {
        if (!objectStore.indexNames.contains(name)) objectStore.createIndex(name, name, { unique });
      }
    }

    if (oldVersion < 1) this.seed(tx);
    if (created.has(DbStore.Customers)) this.seedCustomers(tx);
    this.migrateOldBills(tx);
  }

  // Bills saved before customers and payment status existed were always paid in full
  private migrateOldBills(tx: IDBTransaction): void {
    const itemsRequest = tx.objectStore(DbStore.BillItems).getAll();
    itemsRequest.onsuccess = () => {
      const costByBill = new Map<string, number>();
      for (const item of itemsRequest.result) {
        costByBill.set(item.billId, (costByBill.get(item.billId) ?? 0) + item.qty * item.cost);
      }
      const cursorRequest = tx.objectStore(DbStore.Bills).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const bill = cursor.value;
        if (bill.status) {
          cursor.continue();
          return;
        }
        cursor.update({
          ...bill,
          customerId: '',
          customerName: '',
          customerMobile: '',
          subtotal: bill.total,
          discountType: DiscountType.Amount,
          discountValue: 0,
          discount: 0,
          costTotal: costByBill.get(bill.id) ?? 0,
          status: BillStatus.Paid,
          paidAmount: bill.total,
        });
        cursor.continue();
      };
    };
  }

  private seedCustomers(tx: IDBTransaction): void {
    const categories = DEMO_CUSTOMER_CATEGORIES.map((name) => stamp({ name }));
    categories.forEach((c) => tx.objectStore(DbStore.CustomerCategories).put(c));
    DEMO_CUSTOMERS.forEach(({ category, ...customer }) =>
      tx.objectStore(DbStore.Customers).put(
        stamp({ ...customer, email: '', gstin: '', categoryId: categories[category].id }),
      ),
    );
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
