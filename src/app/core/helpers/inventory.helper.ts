import { SHOP_SETTINGS_ID } from '../constants/db.constant';
import {
  BatchSource,
  CostingMethod,
  DEFAULT_COSTING_METHOD,
  StockMovementType,
} from '../enums/stock.enum';
import { DbStore } from '../enums/db-store.enum';
import { IInventoryBatch, IStockMovement } from '../models/inventory.models';
import { IShopSettingsEntity } from '../models/models';
import { idbRequest } from '../service/database.service';
import { roundMoney } from './bill.helper';
import { stamp } from './entity.helper';

// These run inside a caller's transaction that includes Products, InventoryBatches and
// StockMovements (plus PriceHistory for selling price changes), so stock, batches and
// movements always change together

export const INVENTORY_STORES = [
  DbStore.Products,
  DbStore.InventoryBatches,
  DbStore.StockMovements,
  DbStore.PriceHistory,
  DbStore.Settings,
];

interface IStockProduct {
  id: string;
  name: string;
  stock: number;
  buyPrice: number;
  avgCost?: number;
  sellPrice: number;
  createdAt: string;
  updatedAt: string;
}

export interface IStockIn {
  productId: string;
  qty: number;
  unitCost: number;
  source: BatchSource;
  type: StockMovementType;
  referenceId: string;
  date: string;
  note?: string;
}

export interface IStockOut {
  productId: string;
  qty: number;
  type: StockMovementType;
  referenceId: string;
  date: string;
  note?: string;
}

async function getProduct(tx: IDBTransaction, productId: string): Promise<IStockProduct> {
  const product = await idbRequest<IStockProduct | undefined>(
    tx.objectStore(DbStore.Products).get(productId),
  );
  if (!product) throw new Error('Product not found. It may have been deleted.');
  return product;
}

export async function getCostingMethod(tx: IDBTransaction): Promise<CostingMethod> {
  const shop = await idbRequest<IShopSettingsEntity | undefined>(
    tx.objectStore(DbStore.Settings).get(SHOP_SETTINGS_ID),
  );
  return shop?.costingMethod || DEFAULT_COSTING_METHOD;
}

// Moving weighted average: kept up to date on every stock change, whichever method is chosen,
// so the shop can switch methods at any time
export function averageCostAfter(product: IStockProduct, qtyChange: number, unitCost: number): number {
  const current = product.avgCost ?? product.buyPrice ?? 0;
  const newStock = product.stock + qtyChange;
  if (newStock <= 0) return qtyChange > 0 ? unitCost : current;
  const value = Math.max(0, product.stock) * current + qtyChange * unitCost;
  return roundMoney(Math.max(0, value / newStock));
}

function movement(change: Omit<IStockMovement, 'id' | 'createdAt' | 'updatedAt'>): IStockMovement {
  return stamp(change);
}

export async function addStock(tx: IDBTransaction, change: IStockIn): Promise<IInventoryBatch> {
  const product = await getProduct(tx, change.productId);
  const batch: IInventoryBatch = stamp({
    productId: change.productId,
    source: change.source,
    referenceId: change.referenceId,
    date: change.date,
    initialQty: change.qty,
    remainingQty: change.qty,
    unitCost: change.unitCost,
  });
  await idbRequest(tx.objectStore(DbStore.InventoryBatches).add(batch));
  await idbRequest(
    tx.objectStore(DbStore.StockMovements).add(
      movement({
        productId: change.productId,
        batchId: batch.id,
        type: change.type,
        qty: change.qty,
        unitCost: change.unitCost,
        referenceId: change.referenceId,
        date: change.date,
        note: change.note ?? '',
      }),
    ),
  );
  const buyPrice = change.source === BatchSource.Purchase ? change.unitCost : product.buyPrice;
  await idbRequest(
    tx.objectStore(DbStore.Products).put(
      stamp(
        {
          ...product,
          stock: product.stock + change.qty,
          buyPrice,
          avgCost: averageCostAfter(product, change.qty, change.unitCost),
        },
        product,
      ),
    ),
  );
  return batch;
}

export async function getOpenBatches(
  tx: IDBTransaction,
  productId: string,
): Promise<IInventoryBatch[]> {
  const batches = await idbRequest<IInventoryBatch[]>(
    tx.objectStore(DbStore.InventoryBatches).index('productId').getAll(productId),
  );
  return batches
    .filter((b) => b.remainingQty > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

// Quantities always leave the oldest batches first (FIFO); the cost charged follows the
// costing method from Settings. Returns the total cost of the stock taken
export async function takeStock(tx: IDBTransaction, change: IStockOut): Promise<number> {
  const product = await getProduct(tx, change.productId);
  const method = await getCostingMethod(tx);
  const averageCost = product.avgCost ?? product.buyPrice ?? 0;
  const costOf = (batchCost: number) => (method === CostingMethod.Average ? averageCost : batchCost);
  if (product.stock < change.qty) {
    throw new Error(`Only ${product.stock} ${product.name} in stock`);
  }

  let needed = change.qty;
  let cost = 0;
  for (const batch of await getOpenBatches(tx, change.productId)) {
    if (needed <= 0) break;
    const take = Math.min(needed, batch.remainingQty);
    needed -= take;
    cost += take * costOf(batch.unitCost);
    await idbRequest(
      tx.objectStore(DbStore.InventoryBatches).put(
        stamp({ ...batch, remainingQty: batch.remainingQty - take }, batch),
      ),
    );
    await idbRequest(
      tx.objectStore(DbStore.StockMovements).add(
        movement({
          productId: change.productId,
          batchId: batch.id,
          type: change.type,
          qty: -take,
          unitCost: costOf(batch.unitCost),
          referenceId: change.referenceId,
          date: change.date,
          note: change.note ?? '',
        }),
      ),
    );
  }
  // Stock counted before batch tracking existed has no batch; cost it at the last buy price
  if (needed > 0) {
    cost += needed * costOf(product.buyPrice);
    await idbRequest(
      tx.objectStore(DbStore.StockMovements).add(
        movement({
          productId: change.productId,
          batchId: '',
          type: change.type,
          qty: -needed,
          unitCost: costOf(product.buyPrice),
          referenceId: change.referenceId,
          date: change.date,
          note: change.note ?? '',
        }),
      ),
    );
  }

  await idbRequest(
    tx.objectStore(DbStore.Products).put(
      stamp({ ...product, stock: product.stock - change.qty }, product),
    ),
  );
  return roundMoney(cost);
}

// Undoes every movement of one type for a reference (a bill or a purchase), putting the
// quantities back into the same batches they came from
export async function reverseMovements(
  tx: IDBTransaction,
  referenceId: string,
  fromType: StockMovementType,
  toType: StockMovementType,
  date: string,
): Promise<number> {
  const movements = await idbRequest<IStockMovement[]>(
    tx.objectStore(DbStore.StockMovements).index('referenceId').getAll(referenceId),
  );
  const toReverse = movements.filter((m) => m.type === fromType);
  for (const m of toReverse) {
    if (m.batchId) {
      const batch = await idbRequest<IInventoryBatch | undefined>(
        tx.objectStore(DbStore.InventoryBatches).get(m.batchId),
      );
      if (batch) {
        await idbRequest(
          tx.objectStore(DbStore.InventoryBatches).put(
            stamp({ ...batch, remainingQty: batch.remainingQty - m.qty }, batch),
          ),
        );
      }
    }
    const product = await idbRequest<IStockProduct | undefined>(
      tx.objectStore(DbStore.Products).get(m.productId),
    );
    if (product) {
      await idbRequest(
        tx.objectStore(DbStore.Products).put(
          stamp(
            {
              ...product,
              stock: product.stock - m.qty,
              avgCost: averageCostAfter(product, -m.qty, m.unitCost),
            },
            product,
          ),
        ),
      );
    }
    await idbRequest(
      tx.objectStore(DbStore.StockMovements).add(
        movement({ ...m, type: toType, qty: -m.qty, date, note: '' }),
      ),
    );
  }
  return toReverse.length;
}

export async function recordSellPrice(
  tx: IDBTransaction,
  productId: string,
  sellPrice: number,
  date: string,
): Promise<void> {
  await idbRequest(
    tx.objectStore(DbStore.PriceHistory).add(stamp({ productId, sellPrice, date })),
  );
}
