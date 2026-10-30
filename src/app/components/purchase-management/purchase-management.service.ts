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
} from './purchase-management.interface';

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

  // Every line becomes its own stock batch at its purchase cost, so FIFO can sell it later
  savePurchase(payload: IPurchaseRequestModel): Observable<IPurchase> {
    return this.db.transaction(
      [DbStore.Purchases, DbStore.PurchaseItems, ...INVENTORY_STORES],
      'readwrite',
      async (tx) => {
        const purchaseId = newId();
        let total = 0;
        for (const line of payload.items) {
          const amount = roundMoney(line.qty * line.unitCost);
          total += amount;
          await idbRequest(
            tx.objectStore(DbStore.PurchaseItems).add(stamp({ ...line, purchaseId, amount })),
          );
          await addStock(tx, {
            productId: line.productId,
            qty: line.qty,
            unitCost: line.unitCost,
            source: BatchSource.Purchase,
            type: StockMovementType.Purchase,
            referenceId: purchaseId,
            date: payload.date,
          });
          if (line.sellPrice !== null) {
            const products = tx.objectStore(DbStore.Products);
            const product = await idbRequest<IProduct | undefined>(products.get(line.productId));
            if (product && product.sellPrice !== line.sellPrice) {
              await idbRequest(
                products.put(stamp({ ...product, sellPrice: line.sellPrice }, product)),
              );
              await recordSellPrice(tx, product.id, line.sellPrice, new Date().toISOString());
            }
          }
        }

        const purchase: IPurchase = stamp(
          {
            date: payload.date,
            supplierName: payload.supplierName,
            note: payload.note,
            total: roundMoney(total),
            itemCount: payload.items.length,
            status: PurchaseStatus.Active,
          },
          { id: purchaseId },
        );
        await idbRequest(tx.objectStore(DbStore.Purchases).add(purchase));
        return purchase;
      },
    );
  }

  // Only a purchase whose stock is still untouched can be cancelled; once some of it is sold,
  // the stock count must be corrected with a stock adjustment instead
  cancelPurchase(id: string): Observable<IPurchase> {
    return this.db.transaction(
      [DbStore.Purchases, ...INVENTORY_STORES],
      'readwrite',
      async (tx) => {
        const purchases = tx.objectStore(DbStore.Purchases);
        const purchase = await idbRequest<IPurchase | undefined>(purchases.get(id));
        if (!purchase) throw new Error('Purchase not found');
        if (purchase.status === PurchaseStatus.Cancelled) return purchase;

        const movements = await idbRequest<IStockMovement[]>(
          tx.objectStore(DbStore.StockMovements).index('referenceId').getAll(id),
        );
        const purchaseMovements = movements.filter((x) => x.type === StockMovementType.Purchase);
        // Stock history beyond the limit in Settings is deleted, so an old purchase may no longer
        // know which batches it created
        if (purchaseMovements.length < purchase.itemCount) {
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
        const updated = stamp({ ...purchase, status: PurchaseStatus.Cancelled }, purchase);
        await idbRequest(purchases.put(updated));
        return updated;
      },
    );
  }
}
