import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  addLedgerEntry,
  addStock,
  BatchSource,
  BillStatus,
  DatabaseService,
  DbStore,
  idbRequest,
  INVENTORY_STORES,
  returnStockLots,
  reverseMovements,
  roundMoney,
  ILedgerEntry,
  LEDGER_STORES,
  LedgerType,
  stamp,
  StockMovementType,
} from 'src/app/core.index';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { IBill, IBillItem, IBillWithItems } from '../billing/billing.interface';

function localDayStart(date: Date, addDays = 0): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays);
  return customDatetime(day, { get: 'UTC' });
}

@Injectable({
  providedIn: 'root',
})
export class BillHistoryService {
  constructor(private db: DatabaseService) {}

  // from / to are local days, null = open ended; bill dates are stored as UTC ISO strings
  getBillList(from: Date | null, to: Date | null): Observable<IBill[]> {
    const lower = from ? localDayStart(from) : undefined;
    const upper = to ? localDayStart(to, 1) : undefined;

    return this.db.transaction([DbStore.Bills], 'readonly', async (tx) => {
      let range: IDBKeyRange | undefined;
      if (lower && upper) range = IDBKeyRange.bound(lower, upper, false, true);
      else if (lower) range = IDBKeyRange.lowerBound(lower);
      else if (upper) range = IDBKeyRange.upperBound(upper, true);
      const bills = await idbRequest<IBill[]>(
        tx.objectStore(DbStore.Bills).index('date').getAll(range),
      );
      return bills.sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  // All bills of one customer in one calendar month (local time), newest first
  getCustomerBills(customerId: string, month: Date): Observable<IBill[]> {
    const from = customDatetime(new Date(month.getFullYear(), month.getMonth(), 1), { get: 'UTC' });
    const to = customDatetime(new Date(month.getFullYear(), month.getMonth() + 1, 1), {
      get: 'UTC',
    });
    return this.db.transaction([DbStore.Bills], 'readonly', async (tx) => {
      const range = IDBKeyRange.bound([customerId, from], [customerId, to], false, true);
      const bills = await idbRequest<IBill[]>(
        tx.objectStore(DbStore.Bills).index('customerDate').getAll(range),
      );
      return bills.sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  // Newest bills of one customer; walks the index backwards, so only `limit` bills are read
  getRecentCustomerBills(customerId: string, limit: number): Observable<IBill[]> {
    return this.db.transaction([DbStore.Bills], 'readonly', (tx) => {
      const range = IDBKeyRange.bound([customerId, ''], [customerId, '\uffff']);
      const request = tx.objectStore(DbStore.Bills).index('customerDate').openCursor(range, 'prev');
      const bills: IBill[] = [];
      return new Promise<IBill[]>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || bills.length >= limit) {
            resolve(bills);
            return;
          }
          bills.push(cursor.value as IBill);
          cursor.continue();
        };
      });
    });
  }

  getBillDetail(id: string): Observable<IBillWithItems> {
    return this.db.transaction([DbStore.Bills, DbStore.BillItems], 'readonly', async (tx) => {
      const bill = await idbRequest<IBill | undefined>(tx.objectStore(DbStore.Bills).get(id));
      if (!bill) throw new Error('Bill not found');
      const items = await idbRequest<IBillItem[]>(
        tx.objectStore(DbStore.BillItems).index('billId').getAll(id),
      );
      return { ...bill, items };
    });
  }

  // Money received or given back in a period (all customers), for the History summary
  getPayments(from: Date, to: Date): Observable<ILedgerEntry[]> {
    const range = IDBKeyRange.bound(localDayStart(from), localDayStart(to, 1), false, true);
    return this.db.transaction([DbStore.CustomerLedger], 'readonly', (tx) =>
      idbRequest<ILedgerEntry[]>(
        tx.objectStore(DbStore.CustomerLedger).index('createdAt').getAll(range),
      ),
    );
  }

  // What all customers owe right now (dues only; advances are not subtracted)
  getTotalDue(): Observable<number> {
    return this.db.transaction([DbStore.Customers], 'readonly', async (tx) => {
      const customers = await idbRequest<{ balance?: number }[]>(
        tx.objectStore(DbStore.Customers).getAll(),
      );
      return roundMoney(customers.reduce((sum, c) => sum + Math.max(0, c.balance ?? 0), 0));
    });
  }

  // Cancelling puts the sold quantities back into the batches they came from (bills saved before
  // batch tracking have no movements, so their items come back as a new batch at cost) and takes
  // the bill amount off the customer's account. Money received with the bill stays received
  cancelBill(id: string): Observable<IBill> {
    return this.db.transaction(
      [DbStore.Bills, DbStore.BillItems, ...INVENTORY_STORES, ...LEDGER_STORES],
      'readwrite',
      async (tx) => {
        const bills = tx.objectStore(DbStore.Bills);
        const bill = await idbRequest<IBill | undefined>(bills.get(id));
        if (!bill) throw new Error('Bill not found');
        if (bill.status === BillStatus.Cancelled) return bill;
        if (bill.status === BillStatus.Draft) throw new Error('A draft is deleted, not cancelled');

        const now = new Date().toISOString();
        const items = await idbRequest<IBillItem[]>(
          tx.objectStore(DbStore.BillItems).index('billId').getAll(id),
        );
        if (items.length && items.every((item) => item.lots)) {
          for (const item of items) {
            await returnStockLots(tx, item.productId, item.lots!, id, now);
          }
        } else {
          // Bills saved before lots were kept on the bill: undo their own sale movements, or
          // (older still) bring the items back as a new lot at cost
          const reversed = await reverseMovements(
            tx,
            id,
            StockMovementType.Sale,
            StockMovementType.SaleCancel,
            now,
          );
          if (!reversed) {
            for (const item of items) {
              const product = await idbRequest(
                tx.objectStore(DbStore.Products).get(item.productId),
              );
              if (!product) continue;
              const factor = item.factor ?? 1;
              await addStock(tx, {
                productId: item.productId,
                qty: item.qty * factor,
                unitCost: item.cost / factor,
                source: BatchSource.Return,
                type: StockMovementType.SaleCancel,
                referenceId: id,
                date: now,
              });
            }
          }
        }
        const customer = await idbRequest(tx.objectStore(DbStore.Customers).get(bill.customerId));
        if (customer && bill.total > 0) {
          await addLedgerEntry(tx, {
            customerId: bill.customerId,
            type: LedgerType.BillCancel,
            amount: bill.total,
            referenceId: bill.id,
            systemRemark: `Bill ${bill.no} cancelled`,
          });
        }
        const updated = stamp({ ...bill, status: BillStatus.Cancelled }, bill);
        await idbRequest(bills.put(updated));
        return updated;
      },
    );
  }
}
