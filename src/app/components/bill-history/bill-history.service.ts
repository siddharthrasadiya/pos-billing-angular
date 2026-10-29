import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DatabaseService, DbStore, idbRequest } from 'src/app/core.index';
import { IBill, IBillItem, IBillWithItems } from '../billing/billing.interface';

@Injectable({
  providedIn: 'root',
})
export class BillHistoryService {
  constructor(private db: DatabaseService) {}

  // day is a local date (YYYY-MM-DD); bill dates are stored as UTC ISO strings
  getBillsByDay(day: string): Observable<IBillWithItems[]> {
    const start = new Date(day + 'T00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return this.db.transaction([DbStore.Bills, DbStore.BillItems], 'readonly', async (tx) => {
      const range = IDBKeyRange.bound(start.toISOString(), end.toISOString(), false, true);
      const bills = await idbRequest<IBill[]>(tx.objectStore(DbStore.Bills).index('date').getAll(range));
      const itemsIndex = tx.objectStore(DbStore.BillItems).index('billId');
      const withItems = await Promise.all(
        bills.map(async (bill) => ({
          ...bill,
          items: await idbRequest<IBillItem[]>(itemsIndex.getAll(bill.id)),
        })),
      );
      return withItems.sort((a, b) => b.date.localeCompare(a.date));
    });
  }
}
