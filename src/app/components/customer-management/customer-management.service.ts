import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  addLedgerEntry,
  DatabaseService,
  DbStore,
  ICategory,
  idbRequest,
  ILedgerEntry,
  isDuplicateName,
  LEDGER_STORES,
  LEDGER_TYPE_LABELS,
  LedgerType,
  mobileDigits,
  PAYMENT_MODE_LABELS,
  PaymentMode,
  stamp,
  WALK_IN_CUSTOMER_ID,
} from 'src/app/core.index';
import { CustomerRequestModel, ICustomer } from './customer-management.interface';

export interface IStatement {
  // The customer's balance now: plus = due, minus = advance
  balance: number;
  // Newest first, each with the balance after it
  entries: ILedgerEntry[];
}

@Injectable({
  providedIn: 'root',
})
export class CustomerManagementService {
  constructor(private db: DatabaseService) {}

  getCustomerList(): Observable<ICustomer[]> {
    return this.db.getAll<ICustomer>(DbStore.Customers);
  }

  getCustomer(id: string): Observable<ICustomer | undefined> {
    return this.db.get<ICustomer>(DbStore.Customers, id);
  }

  // The balance is never taken from the form: only statement entries change it
  saveCustomer(payload: CustomerRequestModel, existing?: ICustomer): Observable<ICustomer> {
    return this.db.transaction([DbStore.Customers], 'readwrite', async (tx) => {
      const store = tx.objectStore(DbStore.Customers);
      const current = existing
        ? await idbRequest<ICustomer | undefined>(store.get(existing.id))
        : undefined;
      const contacts = payload.contacts.filter((c) => c.mobile);
      const customer: ICustomer = stamp(
        {
          ...payload,
          contacts,
          mobile: contacts[0]?.mobile ?? '',
          balance: current?.balance ?? 0,
        },
        existing,
      );
      await idbRequest(store.put(customer));
      return customer;
    });
  }

  // Walk-in and customers with money still open stay; old bills keep the customer's name
  deleteCustomer(id: string): Observable<void> {
    return this.db.transaction(LEDGER_STORES, 'readwrite', async (tx) => {
      if (id === WALK_IN_CUSTOMER_ID) throw new Error('Walk-in customer cannot be deleted');
      const customer = await idbRequest<ICustomer | undefined>(
        tx.objectStore(DbStore.Customers).get(id),
      );
      if (customer?.balance) {
        throw new Error('Settle the due or advance first (balance must be 0)');
      }
      const ledger = tx.objectStore(DbStore.CustomerLedger);
      const range = IDBKeyRange.bound([id, ''], [id, '\uffff']);
      const keys = await idbRequest<IDBValidKey[]>(
        ledger.index('customerCreated').getAllKeys(range),
      );
      for (const key of keys) await idbRequest(ledger.delete(key));
      await idbRequest(tx.objectStore(DbStore.Customers).delete(id));
    });
  }

  // Money received from the customer, or given back to them (also how a wrong entry is undone)
  recordPayment(
    customerId: string,
    type: LedgerType.PaymentIn | LedgerType.PaymentOut,
    amount: number,
    mode: PaymentMode,
    userRemark: string,
  ): Observable<ILedgerEntry> {
    return this.db.transaction(LEDGER_STORES, 'readwrite', async (tx) => {
      const { entry } = await addLedgerEntry(tx, {
        customerId,
        type,
        amount,
        mode,
        userRemark,
        systemRemark: `${LEDGER_TYPE_LABELS[type]} (${PAYMENT_MODE_LABELS[mode]})`,
      });
      return entry;
    });
  }

  // All kept entries (at most the statement limit from Settings), newest first. Transaction
  // numbers follow the order entries were added: a payment taken with a bill sits right above it
  getStatement(customerId: string): Observable<IStatement> {
    return this.db.transaction(
      [DbStore.CustomerLedger, DbStore.Customers],
      'readonly',
      async (tx) => {
        const range = IDBKeyRange.bound([customerId, ''], [customerId, '￿']);
        const entries = await idbRequest<ILedgerEntry[]>(
          tx.objectStore(DbStore.CustomerLedger).index('customerCreated').getAll(range),
        );
        entries.sort((a, b) => b.no.localeCompare(a.no));
        const customer = await idbRequest<ICustomer | undefined>(
          tx.objectStore(DbStore.Customers).get(customerId),
        );
        return { balance: customer?.balance ?? 0, entries };
      },
    );
  }

  getCategoryList(): Observable<ICategory[]> {
    return this.db.getAll<ICategory>(DbStore.CustomerCategories);
  }

  saveCategory(name: string, existing?: ICategory): Observable<ICategory> {
    return this.db.transaction([DbStore.CustomerCategories], 'readwrite', async (tx) => {
      const store = tx.objectStore(DbStore.CustomerCategories);
      const categories = await idbRequest<ICategory[]>(store.getAll());
      if (isDuplicateName(categories, name, existing?.id)) {
        throw new Error(`Category "${name.trim()}" already exists`);
      }
      const category = stamp({ name }, existing);
      await idbRequest(store.put(category));
      return category;
    });
  }

  // Customers of a deleted category move to "No category" in the same transaction
  deleteCategory(id: string): Observable<void> {
    return this.db.transaction(
      [DbStore.CustomerCategories, DbStore.Customers],
      'readwrite',
      async (tx) => {
        const customers = tx.objectStore(DbStore.Customers);
        const used = await idbRequest<ICustomer[]>(customers.index('categoryId').getAll(id));
        await Promise.all(
          used.map((c) => idbRequest(customers.put(stamp({ ...c, categoryId: '' }, c)))),
        );
        await idbRequest(tx.objectStore(DbStore.CustomerCategories).delete(id));
      },
    );
  }
}

// Walk-in first, then by name; matches name, any contact's name or number, and category
export function searchCustomers(
  customers: ICustomer[],
  categories: ICategory[],
  rawQuery: string,
): ICustomer[] {
  const query = rawQuery.trim().toLowerCase();
  const sorted = [...customers].sort(
    (a, b) =>
      Number(b.id === WALK_IN_CUSTOMER_ID) - Number(a.id === WALK_IN_CUSTOMER_ID) ||
      a.name.localeCompare(b.name),
  );
  if (!query) return sorted;
  const digits = mobileDigits(query);
  const categoryName = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
  return sorted.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      (c.contacts ?? []).some(
        (k) =>
          k.name.toLowerCase().includes(query) ||
          (digits !== '' && mobileDigits(k.mobile).includes(digits)),
      ) ||
      (digits !== '' && mobileDigits(c.mobile).includes(digits)) ||
      (categoryName.get(c.categoryId) ?? '').includes(query),
  );
}
