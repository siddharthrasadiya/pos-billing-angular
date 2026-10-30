import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  billNoPrefix,
  DatabaseService,
  DbStore,
  formatBillNo,
  idbRequest,
  roundMoney,
  stamp,
} from 'src/app/core.index';
import { IProduct } from '../product-management/product-management.interface';
import { IBill, IBillRequestModel } from './billing.interface';

@Injectable({
  providedIn: 'root',
})
export class BillingService {
  constructor(private db: DatabaseService) {}

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

  // Bill, its items and the stock change commit together or not at all
  saveBill(payload: IBillRequestModel): Observable<IBill> {
    return this.db.transaction(
      [DbStore.Bills, DbStore.BillItems, DbStore.Products],
      'readwrite',
      async (tx) => {
        const { items: lines, ...header } = payload;
        const bill: IBill = stamp({
          ...header,
          costTotal: roundMoney(lines.reduce((sum, l) => sum + l.qty * l.cost, 0)),
          itemCount: lines.length,
        });
        await idbRequest(tx.objectStore(DbStore.Bills).add(bill));

        const items = tx.objectStore(DbStore.BillItems);
        const products = tx.objectStore(DbStore.Products);
        for (const line of payload.items) {
          await idbRequest(
            items.add(
              stamp({
                billId: bill.id,
                productId: line.productId,
                name: line.name,
                qty: line.qty,
                rate: line.rate,
                cost: line.cost,
                amount: line.qty * line.rate,
              }),
            ),
          );
          const product = await idbRequest<IProduct | undefined>(products.get(line.productId));
          if (product) {
            await idbRequest(products.put(stamp({ ...product, stock: product.stock - line.qty }, product)));
          }
        }
        return bill;
      },
    );
  }
}
