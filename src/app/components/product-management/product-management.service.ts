import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  addStock,
  baseUnit,
  BatchSource,
  DatabaseService,
  DbStore,
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
  unitFactor,
} from 'src/app/core.index';
import { IPurchase, PurchaseStatus } from '../purchase-management/purchase-management.interface';
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
  // only through purchases, sales and stock adjustments, never by editing the product.
  // The form gives opening stock and buying price per primary unit; they are kept per base unit
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
        const current =
          (await idbRequest<IProduct | undefined>(products.get(existing.id))) ?? existing;
        // Stock is a count of the base unit, so that unit cannot change while there is stock.
        // Products from before units existed have no unit saved; their count becomes the new base
        if (current.stock !== 0 && current.unit && baseUnit(current) !== baseUnit(payload)) {
          throw new Error(
            `Stock is counted in ${baseUnit(current)}. Make stock 0 with Adjust stock first, ` +
              `then change the unit to ${baseUnit(payload)}`,
          );
        }
        const product = stamp(
          {
            ...current,
            name: payload.name,
            localName: payload.localName,
            shortName: payload.shortName,
            categoryId: payload.categoryId,
            sellPrice: payload.sellPrice,
            unit: payload.unit,
            subUnit: payload.subUnit,
            unitFactor: payload.unitFactor,
            minStock: payload.minStock,
          },
          current,
        );
        await idbRequest(products.put(product));
        if (current.sellPrice !== payload.sellPrice) {
          await recordSellPrice(tx, product.id, payload.sellPrice, now);
        }
        return product;
      }

      const factor = unitFactor(payload);
      const product: IProduct = stamp({
        ...payload,
        buyPrice: payload.buyPrice / factor,
        stock: 0,
      });
      await idbRequest(products.add(product));
      await recordSellPrice(tx, product.id, payload.sellPrice, now);
      if (payload.stock > 0) {
        await addStock(tx, {
          productId: product.id,
          qty: payload.stock * factor,
          unitCost: payload.buyPrice / factor,
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
          qty: payload.qty * payload.factor,
          unitCost: payload.unitCost / payload.factor,
          source: BatchSource.Adjustment,
          type: StockMovementType.AdjustmentIn,
          referenceId: '',
          date,
          note: payload.note,
        });
      } else {
        await takeStock(tx, {
          productId,
          qty: payload.qty * payload.factor,
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
        const newestFirst = (
          a: { date: string; createdAt: string },
          b: { date: string; createdAt: string },
        ) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
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

  // Stock value per product (FIFO): every open batch at its own buying price
  getStockValuation(): Observable<IStockValuation> {
    return this.db.transaction(
      [DbStore.Products, DbStore.InventoryBatches],
      'readonly',
      async (tx) => {
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
          const tracked = batchValue.get(product.id) ?? { qty: 0, value: 0 };
          const untracked = Math.max(0, stock - tracked.qty);
          byProduct[product.id] = roundMoney(tracked.value + untracked * product.buyPrice);
        }
        const total = roundMoney(Object.values(byProduct).reduce((sum, v) => sum + v, 0));
        return { byProduct, total };
      },
    );
  }

  // Its batches, stock movements and price history go too, so nothing is left behind in the
  // database or backups. Old bills keep their own copy of name and price and still open
  deleteProduct(id: string): Observable<void> {
    const history = [DbStore.InventoryBatches, DbStore.StockMovements, DbStore.PriceHistory];
    const stores = [DbStore.Products, DbStore.Purchases, DbStore.PurchaseItems, ...history];
    return this.db.transaction(stores, 'readwrite', async (tx) => {
      const lines = await idbRequest<{ purchaseId: string }[]>(
        tx.objectStore(DbStore.PurchaseItems).index('productId').getAll(id),
      );
      for (const line of lines) {
        const purchase = await idbRequest<IPurchase | undefined>(
          tx.objectStore(DbStore.Purchases).get(line.purchaseId),
        );
        if (purchase?.status === PurchaseStatus.Ordered) {
          throw new Error(
            'This product is on an open purchase order. Receive or cancel that order first.',
          );
        }
      }
      for (const store of history) {
        const objectStore = tx.objectStore(store);
        const keys = await idbRequest<IDBValidKey[]>(objectStore.index('productId').getAllKeys(id));
        for (const key of keys) await idbRequest(objectStore.delete(key));
      }
      await idbRequest(tx.objectStore(DbStore.Products).delete(id));
    });
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
    return this.db.transaction([DbStore.Categories, DbStore.Products], 'readwrite', async (tx) => {
      const products = tx.objectStore(DbStore.Products);
      const used = await idbRequest<IProduct[]>(products.index('categoryId').getAll(id));
      await Promise.all(
        used.map((p) => idbRequest(products.put(stamp({ ...p, categoryId: '' }, p)))),
      );
      await idbRequest(tx.objectStore(DbStore.Categories).delete(id));
    });
  }
}
