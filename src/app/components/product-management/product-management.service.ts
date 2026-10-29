import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DatabaseService, DbStore, idbRequest, stamp } from 'src/app/core.index';
import { ICategory, IProduct, ProductRequestModel } from './product-management.interface';

@Injectable({
  providedIn: 'root',
})
export class ProductManagementService {
  constructor(private db: DatabaseService) {}

  getProductList(): Observable<IProduct[]> {
    return this.db.getAll<IProduct>(DbStore.Products);
  }

  saveProduct(payload: ProductRequestModel, existing?: IProduct): Observable<IProduct> {
    return this.db.put(DbStore.Products, stamp(payload, existing));
  }

  deleteProduct(id: string): Observable<void> {
    return this.db.delete(DbStore.Products, id);
  }

  getCategoryList(): Observable<ICategory[]> {
    return this.db.getAll<ICategory>(DbStore.Categories);
  }

  saveCategory(name: string, existing?: ICategory): Observable<ICategory> {
    return this.db.put(DbStore.Categories, stamp({ name }, existing));
  }

  // Products of a deleted category move to "No category" in the same transaction
  deleteCategory(id: string): Observable<void> {
    return this.db.transaction(
      [DbStore.Categories, DbStore.Products],
      'readwrite',
      async (tx) => {
        const products = tx.objectStore(DbStore.Products);
        const used = await idbRequest<IProduct[]>(products.index('categoryId').getAll(id));
        await Promise.all(
          used.map((p) => idbRequest(products.put(stamp({ ...p, categoryId: '' }, p)))),
        );
        await idbRequest(tx.objectStore(DbStore.Categories).delete(id));
      },
    );
  }
}
