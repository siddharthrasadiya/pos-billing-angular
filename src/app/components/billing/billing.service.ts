import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  billNoPrefix,
  DatabaseService,
  DbStore,
  formatBillNo,
  idbRequest,
  INVENTORY_STORES,
  newId,
  roundMoney,
  stamp,
  StockMovementType,
  takeStock,
} from 'src/app/core.index';
import { IBill, IBillDraft, IBillRequestModel } from './billing.interface';

const DRAFT_KEY = 'pos.billDraft';

@Injectable({
  providedIn: 'root',
})
export class BillingService {
  constructor(private db: DatabaseService) {}

  getDraft(): IBillDraft | null {
    try {
      const value = localStorage.getItem(DRAFT_KEY);
      return value ? (JSON.parse(value) as IBillDraft) : null;
    } catch {
      return null;
    }
  }

  saveDraft(draft: IBillDraft): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }

  clearDraft(): void {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  // Next serial after the highest saved bill number of this financial year
  getNextBillNo(date: Date): Observable<string> {
    const prefix = billNoPrefix(date);
    return this.db.transaction([DbStore.Bills], 'readonly', async (tx) => {
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      const cursor = await idbRequest(
        tx.objectStore(DbStore.Bills).index('no').openCursor(range, 'prev'),
      );
      const last = cursor ? Number((cursor.value as IBill).no.slice(prefix.length)) || 0 : 0;
      return formatBillNo(prefix, last + 1);
    });
  }

  // Bill, its items and the FIFO stock change commit together or not at all; selling more
  // than the stock aborts the whole bill
  saveBill(payload: IBillRequestModel): Observable<IBill> {
    return this.db.transaction(
      [DbStore.Bills, DbStore.BillItems, ...INVENTORY_STORES],
      'readwrite',
      async (tx) => {
        const { items: lines, ...header } = payload;
        const billId = newId();
        const itemRows = [];
        let costTotal = 0;
        for (const line of lines) {
          const cost = await takeStock(tx, {
            productId: line.productId,
            qty: line.qty,
            type: StockMovementType.Sale,
            referenceId: billId,
            date: payload.date,
          });
          costTotal += cost;
          itemRows.push(
            stamp({
              billId,
              productId: line.productId,
              name: line.name,
              localName: line.localName,
              qty: line.qty,
              rate: line.rate,
              cost: roundMoney(cost / line.qty),
              amount: roundMoney(line.qty * line.rate),
            }),
          );
        }

        const bill: IBill = stamp(
          { ...header, costTotal: roundMoney(costTotal), itemCount: lines.length },
          { id: billId },
        );
        await idbRequest(tx.objectStore(DbStore.Bills).add(bill));
        for (const item of itemRows) {
          await idbRequest(tx.objectStore(DbStore.BillItems).add(item));
        }
        return bill;
      },
    );
  }
}
