import { SHOP_SETTINGS_ID } from '../constants/db.constant';
import { BatchSource, DEFAULT_HISTORY_LIMIT, StockMovementType } from '../enums/stock.enum';
import { DbStore } from '../enums/db-store.enum';
import { IInventoryBatch, IStockLot, IStockMovement } from '../models/inventory.models';
import customDatetime from '../shared/custom-elements/custom-datetime.pipe';
import { IShopSettingsEntity } from '../models/models';
import { idbRequest } from '../service/database.service';
import { roundMoney } from './bill.helper';
import { stamp } from './entity.helper';
import { formatStock, IProductUnits } from './unit.helper';

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

interface IStockProduct extends IProductUnits {
  id: string;
  name: string;
  stock: number;
  buyPrice: number;
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

// Keeps only the newest entries per product (limits from Settings) and deletes the rest for good,
// so the database and its backups stay small
export async function pruneProductHistory(tx: IDBTransaction, productId: string): Promise<void> {
  const shop = await idbRequest<IShopSettingsEntity | undefined>(
    tx.objectStore(DbStore.Settings).get(SHOP_SETTINGS_ID),
  );
  await pruneStore(
    tx,
    DbStore.PriceHistory,
    productId,
    shop?.priceHistoryLimit || DEFAULT_HISTORY_LIMIT,
  );
  await pruneStore(
    tx,
    DbStore.StockMovements,
    productId,
    shop?.movementHistoryLimit || DEFAULT_HISTORY_LIMIT,
  );
}

async function pruneStore(tx: IDBTransaction, store: DbStore, productId: string, keep: number) {
  const objectStore = tx.objectStore(store);
  const rows = await idbRequest<{ id: string; createdAt: string }[]>(
    objectStore.index('productId').getAll(productId),
  );
  if (rows.length <= keep) return;
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const row of rows.slice(keep)) {
    await idbRequest(objectStore.delete(row.id));
  }
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
        },
        product,
      ),
    ),
  );
  await pruneProductHistory(tx, change.productId);
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

// FIFO: quantities leave the oldest batches first, each at its own buying price.
// Returns the total cost and the lots used, so a cancelled bill can put stock back exactly
export async function takeStock(
  tx: IDBTransaction,
  change: IStockOut,
): Promise<{ cost: number; lots: IStockLot[] }> {
  const product = await getProduct(tx, change.productId);
  if (product.stock < change.qty) {
    throw new Error(`Only ${formatStock(product.stock, product)} of ${product.name} in stock`);
  }

  let needed = change.qty;
  const lots: IStockLot[] = [];
  for (const batch of await getOpenBatches(tx, change.productId)) {
    if (needed <= 0) break;
    const take = Math.min(needed, batch.remainingQty);
    needed -= take;
    lots.push({ batchId: batch.id, qty: take, unitCost: batch.unitCost });
    await idbRequest(
      tx
        .objectStore(DbStore.InventoryBatches)
        .put(stamp({ ...batch, remainingQty: batch.remainingQty - take }, batch)),
    );
  }
  // Stock counted before batch tracking existed has no batch; cost it at the last buy price
  if (needed > 0) lots.push({ batchId: '', qty: needed, unitCost: product.buyPrice });

  if (change.type === StockMovementType.Sale) {
    await addToDailySales(tx, change);
  } else {
    for (const lot of lots) {
      await idbRequest(
        tx.objectStore(DbStore.StockMovements).add(
          movement({
            productId: change.productId,
            batchId: lot.batchId,
            type: change.type,
            qty: -lot.qty,
            unitCost: lot.unitCost,
            referenceId: change.referenceId,
            date: change.date,
            note: change.note ?? '',
          }),
        ),
      );
    }
  }

  await idbRequest(
    tx
      .objectStore(DbStore.Products)
      .put(stamp({ ...product, stock: product.stock - change.qty }, product)),
  );
  await pruneProductHistory(tx, change.productId);
  return { cost: roundMoney(lots.reduce((sum, l) => sum + l.qty * l.unitCost, 0)), lots };
}

// All sales of a product on one day share a single movement row ("-14 pcs, 7 bills"), so busy
// products keep weeks of stock history within the movement limit
async function addToDailySales(tx: IDBTransaction, change: IStockOut): Promise<void> {
  const store = tx.objectStore(DbStore.StockMovements);
  const referenceId = `sales:${change.productId}:${customDatetime(change.date, { get: 'day' })}`;
  const [today] = await idbRequest<IStockMovement[]>(
    store.index('referenceId').getAll(referenceId),
  );
  if (today) {
    await idbRequest(
      store.put(
        stamp(
          {
            ...today,
            qty: today.qty - change.qty,
            billCount: (today.billCount ?? 1) + (today.lastBillId === change.referenceId ? 0 : 1),
            lastBillId: change.referenceId,
            date: change.date > today.date ? change.date : today.date,
          },
          today,
        ),
      ),
    );
    return;
  }
  await idbRequest(
    store.add(
      movement({
        productId: change.productId,
        batchId: '',
        type: StockMovementType.Sale,
        qty: -change.qty,
        unitCost: 0,
        billCount: 1,
        lastBillId: change.referenceId,
        referenceId,
        date: change.date,
        note: '',
      }),
    ),
  );
}

// Puts a cancelled bill line back into the lots it was sold from; a lot that no longer exists
// (deleted by a purchase cancel or old data) comes back as a "Returned" lot at its cost
export async function returnStockLots(
  tx: IDBTransaction,
  productId: string,
  lots: IStockLot[],
  referenceId: string,
  date: string,
): Promise<void> {
  const product = await idbRequest<IStockProduct | undefined>(
    tx.objectStore(DbStore.Products).get(productId),
  );
  if (!product) return;
  const batches = tx.objectStore(DbStore.InventoryBatches);
  let qty = 0;
  for (const lot of lots) {
    const batch = lot.batchId
      ? await idbRequest<IInventoryBatch | undefined>(batches.get(lot.batchId))
      : undefined;
    if (batch) {
      await idbRequest(
        batches.put(stamp({ ...batch, remainingQty: batch.remainingQty + lot.qty }, batch)),
      );
    } else {
      await idbRequest(
        batches.add(
          stamp({
            productId,
            source: BatchSource.Return,
            referenceId,
            date,
            initialQty: lot.qty,
            remainingQty: lot.qty,
            unitCost: lot.unitCost,
          }),
        ),
      );
    }
    qty += lot.qty;
  }
  await idbRequest(
    tx.objectStore(DbStore.StockMovements).add(
      movement({
        productId,
        batchId: '',
        type: StockMovementType.SaleCancel,
        qty,
        unitCost: lots[0]?.unitCost ?? 0,
        referenceId,
        date,
        note: '',
      }),
    ),
  );
  await idbRequest(
    tx
      .objectStore(DbStore.Products)
      .put(stamp({ ...product, stock: product.stock + qty }, product)),
  );
  await pruneProductHistory(tx, productId);
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
          tx
            .objectStore(DbStore.InventoryBatches)
            .put(stamp({ ...batch, remainingQty: batch.remainingQty - m.qty }, batch)),
        );
      }
    }
    const product = await idbRequest<IStockProduct | undefined>(
      tx.objectStore(DbStore.Products).get(m.productId),
    );
    if (product) {
      await idbRequest(
        tx
          .objectStore(DbStore.Products)
          .put(stamp({ ...product, stock: product.stock - m.qty }, product)),
      );
    }
    await idbRequest(
      tx
        .objectStore(DbStore.StockMovements)
        .add(movement({ ...m, type: toType, qty: -m.qty, date, note: '' })),
    );
  }
  for (const productId of new Set(toReverse.map((m) => m.productId))) {
    await pruneProductHistory(tx, productId);
  }
  return toReverse.length;
}

export async function recordSellPrice(
  tx: IDBTransaction,
  productId: string,
  sellPrice: number,
  date: string,
): Promise<void> {
  await idbRequest(tx.objectStore(DbStore.PriceHistory).add(stamp({ productId, sellPrice, date })));
  await pruneProductHistory(tx, productId);
}
