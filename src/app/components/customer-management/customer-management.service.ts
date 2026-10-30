import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DatabaseService, DbStore, ICategory, idbRequest, stamp } from 'src/app/core.index';
import { CustomerRequestModel, ICustomer } from './customer-management.interface';

@Injectable({
  providedIn: 'root',
})
export class CustomerManagementService {
  constructor(private db: DatabaseService) {}

  getCustomerList(): Observable<ICustomer[]> {
    return this.db.getAll<ICustomer>(DbStore.Customers);
  }

  saveCustomer(payload: CustomerRequestModel, existing?: ICustomer): Observable<ICustomer> {
    return this.db.put(DbStore.Customers, stamp(payload, existing));
  }

  deleteCustomer(id: string): Observable<void> {
    return this.db.delete(DbStore.Customers, id);
  }

  getCategoryList(): Observable<ICategory[]> {
    return this.db.getAll<ICategory>(DbStore.CustomerCategories);
  }

  saveCategory(name: string, existing?: ICategory): Observable<ICategory> {
    return this.db.put(DbStore.CustomerCategories, stamp({ name }, existing));
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

export function searchCustomers(
  customers: ICustomer[],
  categories: ICategory[],
  rawQuery: string,
): ICustomer[] {
  const query = rawQuery.trim().toLowerCase();
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  if (!query) return sorted;
  const categoryName = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
  return sorted.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      c.mobile.includes(query) ||
      (categoryName.get(c.categoryId) ?? '').includes(query),
  );
}
