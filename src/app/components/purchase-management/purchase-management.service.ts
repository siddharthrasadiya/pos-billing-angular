import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  addStock,
  BatchSource,
  DatabaseService,
  DbStore,
  idbRequest,
  IInventoryBatch,
  INVENTORY_STORES,
  IStockMovement,
  newId,
  recordSellPrice,
  reverseMovements,
  roundMoney,
  stamp,
  StockMovementType,
} from 'src/app/core.index';
import { IProduct } from '../product-management/product-management.interface';
import {
  IPurchase,
  IPurchaseItem,
  IPurchaseRequestModel,
  IPurchaseWithItems,
  PurchaseStatus,
  ReceivedQuantities,
} from './purchase-management.interface';

const DAY_MS = 24 * 60 * 60 * 1000;

// Purchases closed this many days or fewer before auto-delete get a warning
export function deleteWarningDays(retentionDays: number): number {
  return Math.max(2, Math.round(retentionDays / 6));
}

export function daysUntilAutoDelete(purchase: IPurchase, retentionDays: number): number | null {
  if (purchase.status === PurchaseStatus.Ordered || !purchase.closedAt) return null;
  const deleteAt = new Date(purchase.closedAt).getTime() + retentionDays * DAY_MS;
  return Math.max(0, Math.ceil((deleteAt - Date.now()) / DAY_MS));
}

@Injectable({
  providedIn: 'root',
})
export class PurchaseManagementService {
  constructor(private db: DatabaseService) {}

  getPurchaseList(): Observable<IPurchase[]> {
    return this.db.transaction([DbStore.Purchases], 'readonly', async (tx) => {
      const purchases = await idbRequest<IPurchase[]>(tx.objectStore(DbStore.Purchases).getAll());
      return purchases.sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  getPurchaseDetail(id: string): Observable<IPurchaseWithItems> {
    return this.db.transaction(
      [DbStore.Purchases, DbStore.PurchaseItems],
      'readonly',
      async (tx) => {
        const purchase = await idbRequest<IPurchase | undefined>(
          tx.objectStore(DbStore.Purchases).get(id),
        );
        if (!purchase) throw new Error('Purchase not found');
        const items = await idbRequest<IPurchaseItem[]>(
          tx.objectStore(DbStore.PurchaseItems).index('purchaseId').getAll(id),
        );
        return { ...purchase, items };
      },
    );
  }

  // Creates a new order, or replaces the lines of an order that is not received yet.
  // No stock moves until the order is received
  savePurchase(payload: IPurchaseRequestModel, existingId?: string): Observable<IPurchase> {
    return this.db.transaction(
      [DbStore.Purchases, DbStore.PurchaseItems],
      'readwrite',
      async (tx) => {
        const purchases = tx.objectStore(DbStore.Purchases);
        const items = tx.objectStore(DbStore.PurchaseItems);
        const existing = existingId
          ? await idbRequest<IPurchase | undefined>(purchases.get(existingId))
          : undefined;
        if (existingId && !existing) throw new Error('Purchase not found');
        if (existing && existing.status !== PurchaseStatus.Ordered) {
          throw new Error('Only an order that is not received yet can be edited');
        }

        const purchaseId = existing?.id ?? newId();
        if (existing) {
          const oldItems = await idbRequest<IPurchaseItem[]>(
            items.index('purchaseId').getAll(purchaseId),
          );
          for (const item of oldItems) await idbRequest(items.delete(item.id));
        }
        let total = 0;
        for (const line of payload.items) {
          const amount = roundMoney(line.qty * line.unitCost);
          total += amount;
          await idbRequest(
            items.add(stamp({ ...line, purchaseId, amount, receivedQty: null })),
          );
        }

        const purchase: IPurchase = stamp(
          {
            date: payload.date,
            supplierName: payload.supplierName,
            note: payload.note,
            total: roundMoney(total),
            receivedTotal: 0,
            itemCount: payload.items.length,
            status: PurchaseStatus.Ordered,
            receivedAt: '',
            closedAt: '',
          },
          existing ?? { id: purchaseId },
        );
        await idbRequest(purchases.put(purchase));
        return purchase;
      },
    );
  }

  // Only what actually arrived goes into stock, each line as its own batch at its cost;
  // a short delivery (ordered 50, received 45) is kept on the item for reference
  receivePurchase(id: string, received: ReceivedQuantities): Observable<IPurchase> {
    return this.db.transaction(
      [DbStore.Purchases, DbStore.PurchaseItems, ...INVENTORY_STORES],
      'readwrite',
      async (tx) => {
        const purchases = tx.objectStore(DbStore.Purchases);
        const purchase = await idbRequest<IPurchase | undefined>(purchases.get(id));
        if (!purchase) throw new Error('Purchase not found');
        if (purchase.status !== PurchaseStatus.Ordered) {
          throw new Error('This purchase is already ' + purchase.status);
        }

        const now = new Date().toISOString();
        const itemStore = tx.objectStore(DbStore.PurchaseItems);
        const items = await idbRequest<IPurchaseItem[]>(itemStore.index('purchaseId').getAll(id));
        let receivedTotal = 0;
        for (const item of items) {
          const qty = Math.min(item.qty, Math.max(0, Math.floor(received[item.id] ?? item.qty)));
          receivedTotal += qty * item.unitCost;
          await idbRequest(itemStore.put(stamp({ ...item, receivedQty: qty }, item)));
          if (qty > 0) {
            await addStock(tx, {
              productId: item.productId,
              qty,
              unitCost: item.unitCost,
              source: BatchSource.Purchase,
              type: StockMovementType.Purchase,
              referenceId: id,
              date: now,
            });
          }
          if (item.sellPrice !== null) {
            const products = tx.objectStore(DbStore.Products);
            const product = await idbRequest<IProduct | undefined>(products.get(item.productId));
            if (product && product.sellPrice !== item.sellPrice) {
              await idbRequest(
                products.put(stamp({ ...product, sellPrice: item.sellPrice }, product)),
              );
              await recordSellPrice(tx, product.id, item.sellPrice, now);
            }
          }
        }

        const updated = stamp(
          {
            ...purchase,
            status: PurchaseStatus.Received,
            receivedTotal: roundMoney(receivedTotal),
            receivedAt: now,
            closedAt: now,
          },
          purchase,
        );
        await idbRequest(purchases.put(updated));
        return updated;
      },
    );
  }

  // An order is simply dropped; a received purchase is undone only while its stock is unsold,
  // otherwise the stock count must be corrected with a stock adjustment
  cancelPurchase(id: string): Observable<IPurchase> {
    return this.db.transaction(
      [DbStore.Purchases, DbStore.PurchaseItems, ...INVENTORY_STORES],
      'readwrite',
      async (tx) => {
        const purchases = tx.objectStore(DbStore.Purchases);
        const purchase = await idbRequest<IPurchase | undefined>(purchases.get(id));
        if (!purchase) throw new Error('Purchase not found');
        if (purchase.status === PurchaseStatus.Cancelled) return purchase;

        if (purchase.status === PurchaseStatus.Received) {
          const items = await idbRequest<IPurchaseItem[]>(
            tx.objectStore(DbStore.PurchaseItems).index('purchaseId').getAll(id),
          );
          const linesWithStock = items.filter((i) => (i.receivedQty ?? i.qty) > 0).length;
          const movements = await idbRequest<IStockMovement[]>(
            tx.objectStore(DbStore.StockMovements).index('referenceId').getAll(id),
          );
          const purchaseMovements = movements.filter((x) => x.type === StockMovementType.Purchase);
          // Stock history beyond the limit in Settings is deleted, so an old purchase may no
          // longer know which batches it created
          if (purchaseMovements.length < linesWithStock) {
            throw new Error(
              'This purchase is too old to cancel because its stock history was cleared. ' +
                'Use Adjust stock on the product instead.',
            );
          }
          for (const m of purchaseMovements) {
            const batch = await idbRequest<IInventoryBatch | undefined>(
              tx.objectStore(DbStore.InventoryBatches).get(m.batchId),
            );
            if (batch && batch.remainingQty < batch.initialQty) {
              throw new Error(
                'Some of this stock is already sold, so the purchase cannot be cancelled. ' +
                  'Use Adjust stock on the product instead.',
              );
            }
          }
          await reverseMovements(
            tx,
            id,
            StockMovementType.Purchase,
            StockMovementType.PurchaseCancel,
            new Date().toISOString(),
          );
        }

        const updated = stamp(
          { ...purchase, status: PurchaseStatus.Cancelled, closedAt: new Date().toISOString() },
          purchase,
        );
        await idbRequest(purchases.put(updated));
        return updated;
      },
    );
  }

  // Removes the purchase record only; stock that came in with it stays in stock
  deletePurchase(id: string): Observable<void> {
    return this.db.transaction(
      [DbStore.Purchases, DbStore.PurchaseItems],
      'readwrite',
      async (tx) => {
        const items = tx.objectStore(DbStore.PurchaseItems);
        const rows = await idbRequest<IPurchaseItem[]>(items.index('purchaseId').getAll(id));
        for (const row of rows) await idbRequest(items.delete(row.id));
        await idbRequest(tx.objectStore(DbStore.Purchases).delete(id));
      },
    );
  }

  // Received and cancelled purchases older than the retention period are deleted for good;
  // open orders are never deleted automatically
  deleteExpiredPurchases(retentionDays: number): Observable<number> {
    return this.db.transaction(
      [DbStore.Purchases, DbStore.PurchaseItems],
      'readwrite',
      async (tx) => {
        const purchases = await idbRequest<IPurchase[]>(tx.objectStore(DbStore.Purchases).getAll());
        const items = tx.objectStore(DbStore.PurchaseItems);
        let deleted = 0;
        for (const purchase of purchases) {
          if (daysUntilAutoDelete(purchase, retentionDays) !== 0) continue;
          const rows = await idbRequest<IPurchaseItem[]>(
            items.index('purchaseId').getAll(purchase.id),
          );
          for (const row of rows) await idbRequest(items.delete(row.id));
          await idbRequest(tx.objectStore(DbStore.Purchases).delete(purchase.id));
          deleted++;
        }
        return deleted;
      },
    );
  }
}
