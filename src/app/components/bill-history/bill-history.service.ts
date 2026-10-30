import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BillStatus,
  DatabaseService,
  DbStore,
  idbRequest,
  roundMoney,
  stamp,
  statusFromPayment,
} from 'src/app/core.index';
import { IBill, IBillItem, IBillWithItems } from '../billing/billing.interface';
import { IProduct } from '../product-management/product-management.interface';

function localDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Injectable({
  providedIn: 'root',
})
export class BillHistoryService {
  constructor(private db: DatabaseService) {}

  // from / to are local dates (YYYY-MM-DD), empty = open ended; bill dates are UTC ISO strings
  getBillList(from: string, to: string): Observable<IBill[]> {
    const lower = from ? localDayStart(from).toISOString() : undefined;
    const upperDate = to ? localDayStart(to) : undefined;
    upperDate?.setDate(upperDate.getDate() + 1);
    const upper = upperDate?.toISOString();

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

  recordPayment(id: string, amount: number): Observable<IBill> {
    return this.db.transaction([DbStore.Bills], 'readwrite', async (tx) => {
      const store = tx.objectStore(DbStore.Bills);
      const bill = await idbRequest<IBill | undefined>(store.get(id));
      if (!bill) throw new Error('Bill not found');
      if (bill.status === BillStatus.Cancelled) throw new Error('Bill is cancelled');
      const paidAmount = Math.min(bill.total, roundMoney(bill.paidAmount + amount));
      const updated = stamp(
        { ...bill, paidAmount, status: statusFromPayment(bill.total, paidAmount) },
        bill,
      );
      await idbRequest(store.put(updated));
      return updated;
    });
  }

  // Cancelling puts the sold quantity back into stock in the same transaction
  cancelBill(id: string): Observable<IBill> {
    return this.db.transaction(
      [DbStore.Bills, DbStore.BillItems, DbStore.Products],
      'readwrite',
      async (tx) => {
        const bills = tx.objectStore(DbStore.Bills);
        const bill = await idbRequest<IBill | undefined>(bills.get(id));
        if (!bill) throw new Error('Bill not found');
        if (bill.status === BillStatus.Cancelled) return bill;

        const items = await idbRequest<IBillItem[]>(
          tx.objectStore(DbStore.BillItems).index('billId').getAll(id),
        );
        const products = tx.objectStore(DbStore.Products);
        for (const item of items) {
          const product = await idbRequest<IProduct | undefined>(products.get(item.productId));
          if (product) {
            await idbRequest(
              products.put(stamp({ ...product, stock: product.stock + item.qty }, product)),
            );
          }
        }
        const updated = stamp({ ...bill, status: BillStatus.Cancelled }, bill);
        await idbRequest(bills.put(updated));
        return updated;
      },
    );
  }
}
