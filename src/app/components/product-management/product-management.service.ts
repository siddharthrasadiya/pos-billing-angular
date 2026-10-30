import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  addStock,
  BatchSource,
  CostingMethod,
  DatabaseService,
  DbStore,
  getCostingMethod,
  ICategory,
  idbRequest,
  IInventoryBatch,
  INVENTORY_STORES,
  isDuplicateName,
  IPriceHistory,
  IStockMovement,
  recordSellPrice,
  roundMoney,
  stamp,
  StockMovementType,
  takeStock,
} from 'src/app/core.index';
import {
  IProduct,
  IStockAdjustmentModel,
  IStockDetail,
  IStockValuation,
  ProductRequestModel,
  StockDirection,
} from './product-management.interface';

const RECENT_MOVEMENTS = 50;

@Injectable({
  providedIn: 'root',
})
export class ProductManagementService {
  constructor(private db: DatabaseService) {}

  getProductList(): Observable<IProduct[]> {
    return this.db.getAll<IProduct>(DbStore.Products);
  }

  // A new product's opening stock becomes its first batch; afterwards stock and cost change
  // only through purchases, sales and stock adjustments, never by editing the product
  saveProduct(payload: ProductRequestModel, existing?: IProduct): Observable<IProduct> {
    return this.db.transaction(INVENTORY_STORES, 'readwrite', async (tx) => {
      const products = tx.objectStore(DbStore.Products);
      const now = new Date().toISOString();

      const sameCategory = await idbRequest<IProduct[]>(
        products.index('categoryId').getAll(payload.categoryId),
      );
      if (isDuplicateName(sameCategory, payload.name, existing?.id)) {
        throw new Error(`"${payload.name.trim()}" already exists in this category`);
      }

      if (existing) {
        const current = (await idbRequest<IProduct | undefined>(products.get(existing.id))) ?? existing;
        const product = stamp(
          {
            ...current,
            name: payload.name,
            localName: payload.localName,
            shortName: payload.shortName,
            categoryId: payload.categoryId,
            sellPrice: payload.sellPrice,
          },
          current,
        );
        await idbRequest(products.put(product));
        if (current.sellPrice !== payload.sellPrice) {
          await recordSellPrice(tx, product.id, payload.sellPrice, now);
        }
        return product;
      }

      const product: IProduct = stamp({
        ...payload,
        stock: 0,
        avgCost: payload.buyPrice,
      });
      await idbRequest(products.add(product));
      await recordSellPrice(tx, product.id, payload.sellPrice, now);
      if (payload.stock > 0) {
        await addStock(tx, {
          productId: product.id,
          qty: payload.stock,
          unitCost: payload.buyPrice,
          source: BatchSource.Opening,
          type: StockMovementType.Opening,
          referenceId: '',
          date: now,
        });
      }
      return (await idbRequest<IProduct | undefined>(products.get(product.id))) ?? product;
    });
  }

  adjustStock(productId: string, payload: IStockAdjustmentModel): Observable<void> {
    return this.db.transaction(INVENTORY_STORES, 'readwrite', async (tx) => {
      const date = new Date().toISOString();
      if (payload.direction === StockDirection.In) {
        await addStock(tx, {
          productId,
          qty: payload.qty,
          unitCost: payload.unitCost,
          source: BatchSource.Adjustment,
          type: StockMovementType.AdjustmentIn,
          referenceId: '',
          date,
          note: payload.note,
        });
      } else {
        await takeStock(tx, {
          productId,
          qty: payload.qty,
          type: StockMovementType.AdjustmentOut,
          referenceId: '',
          date,
          note: payload.note,
        });
      }
    });
  }

  getStockDetail(productId: string): Observable<IStockDetail> {
    return this.db.transaction(
      [DbStore.InventoryBatches, DbStore.StockMovements, DbStore.PriceHistory],
      'readonly',
      async (tx) => {
        const byProduct = <T>(store: DbStore) =>
          idbRequest<T[]>(tx.objectStore(store).index('productId').getAll(productId));
        const newestFirst = (a: { date: string; createdAt: string }, b: { date: string; createdAt: string }) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
        const batches = await byProduct<IInventoryBatch>(DbStore.InventoryBatches);
        const movements = await byProduct<IStockMovement>(DbStore.StockMovements);
        const prices = await byProduct<IPriceHistory>(DbStore.PriceHistory);
        return {
          batches: batches.sort(newestFirst),
          movements: movements.sort(newestFirst).slice(0, RECENT_MOVEMENTS),
          prices: prices.sort(newestFirst),
        };
      },
    );
  }

  // Stock value per product with the shop's costing method: FIFO values each open batch at its
  // own cost, weighted average values all stock at the running average cost
  getStockValuation(): Observable<IStockValuation> {
    return this.db.transaction(
      [DbStore.Products, DbStore.InventoryBatches, DbStore.Settings],
      'readonly',
      async (tx) => {
        const method = await getCostingMethod(tx);
        const products = await idbRequest<IProduct[]>(tx.objectStore(DbStore.Products).getAll());
        const batches = await idbRequest<IInventoryBatch[]>(
          tx.objectStore(DbStore.InventoryBatches).getAll(),
        );
        const batchValue = new Map<string, { qty: number; value: number }>();
        for (const batch of batches.filter((b) => b.remainingQty > 0)) {
          const entry = batchValue.get(batch.productId) ?? { qty: 0, value: 0 };
          entry.qty += batch.remainingQty;
          entry.value += batch.remainingQty * batch.unitCost;
          batchValue.set(batch.productId, entry);
        }

        const byProduct: Record<string, number> = {};
        for (const product of products) {
          const stock = Math.max(0, product.stock);
          if (method === CostingMethod.Average) {
            byProduct[product.id] = roundMoney(stock * (product.avgCost ?? product.buyPrice));
          } else {
            const tracked = batchValue.get(product.id) ?? { qty: 0, value: 0 };
            const untracked = Math.max(0, stock - tracked.qty);
            byProduct[product.id] = roundMoney(tracked.value + untracked * product.buyPrice);
          }
        }
        const total = roundMoney(Object.values(byProduct).reduce((sum, v) => sum + v, 0));
        return { method, byProduct, total };
      },
    );
  }

  deleteProduct(id: string): Observable<void> {
    return this.db.delete(DbStore.Products, id);
  }

  getCategoryList(): Observable<ICategory[]> {
    return this.db.getAll<ICategory>(DbStore.Categories);
  }

  saveCategory(name: string, existing?: ICategory): Observable<ICategory> {
    return this.db.transaction([DbStore.Categories], 'readwrite', async (tx) => {
      const store = tx.objectStore(DbStore.Categories);
      const categories = await idbRequest<ICategory[]>(store.getAll());
      if (isDuplicateName(categories, name, existing?.id)) {
        throw new Error(`Category "${name.trim()}" already exists`);
      }
      const category = stamp({ name }, existing);
      await idbRequest(store.put(category));
      return category;
    });
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
