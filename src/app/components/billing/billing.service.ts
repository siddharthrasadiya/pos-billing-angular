import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  addLedgerEntry,
  billNoPrefix,
  BillStatus,
  DatabaseService,
  DbStore,
  factorOf,
  formatBillNo,
  idbRequest,
  INVENTORY_STORES,
  IProductUnits,
  LEDGER_STORES,
  LedgerType,
  newId,
  PaymentMode,
  pruneCustomerBills,
  roundMoney,
  stamp,
  StockMovementType,
  takeStock,
} from 'src/app/core.index';
import { IBill, IBillDraft, IBillItem, IBillRequestModel, ICartLine } from './billing.interface';

const DRAFT_KEY = 'pos.billDraft';

type IProductUnitsRow = IProductUnits & { id: string };
const DRAFT_NO_PREFIX = 'DRAFT-';

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

  getDraftBill(id: string): Observable<{ bill: IBill; items: IBillItem[] }> {
    return this.db.transaction([DbStore.Bills, DbStore.BillItems], 'readonly', async (tx) => {
      const bill = await idbRequest<IBill | undefined>(tx.objectStore(DbStore.Bills).get(id));
      if (!bill || bill.status !== BillStatus.Draft) {
        throw new Error('This draft is already issued or deleted');
      }
      const items = await idbRequest<IBillItem[]>(
        tx.objectStore(DbStore.BillItems).index('billId').getAll(id),
      );
      return { bill, items };
    });
  }

  // A draft is only a saved order: no number, no stock change, no account change
  saveDraftBill(payload: IBillRequestModel, draftId: string | null): Observable<IBill> {
    return this.db.transaction([DbStore.Bills, DbStore.BillItems], 'readwrite', async (tx) => {
      const billId = draftId ?? newId();
      const existing = draftId ? await this.removeDraft(tx, draftId) : undefined;
      const { items, ...header } = payload;
      const bill: IBill = stamp(
        {
          ...header,
          no: DRAFT_NO_PREFIX + billId.slice(0, 8),
          status: BillStatus.Draft,
          paidAmount: 0,
          costTotal: 0,
          itemCount: items.length,
        },
        existing ?? { id: billId },
      );
      await idbRequest(tx.objectStore(DbStore.Bills).add(bill));
      for (const line of items) {
        await idbRequest(tx.objectStore(DbStore.BillItems).add(itemRow(billId, line, line.cost)));
      }
      return bill;
    });
  }

  // Number, FIFO stock, the bill amount on the customer's account and the optional payment all
  // commit together or not at all; selling more than the stock aborts the whole bill
  issueBill(
    payload: IBillRequestModel,
    draftId: string | null,
    paymentMode: PaymentMode,
  ): Observable<IBill> {
    return this.db.transaction(
      [DbStore.Bills, DbStore.BillItems, ...INVENTORY_STORES, ...LEDGER_STORES],
      'readwrite',
      async (tx) => {
        const billId = draftId ?? newId();
        if (draftId) await this.removeDraft(tx, draftId);
        const { items: lines, ...header } = payload;
        const no = await nextBillNo(tx, new Date(payload.date));

        const itemRows: IBillItem[] = [];
        let costTotal = 0;
        for (const line of lines) {
          const factor = line.factor ?? 1;
          const product = await idbRequest<IProductUnitsRow | undefined>(
            tx.objectStore(DbStore.Products).get(line.productId),
          );
          if (product && factorOf(product, line.unit) !== factor) {
            throw new Error(`Units of ${line.name} were changed. Remove it and add it again`);
          }
          const { cost, lots } = await takeStock(tx, {
            productId: line.productId,
            qty: line.qty * factor,
            type: StockMovementType.Sale,
            referenceId: billId,
            date: payload.date,
          });
          costTotal += cost;
          itemRows.push({ ...itemRow(billId, line, roundMoney(cost / line.qty)), lots });
        }

        const customer = await idbRequest<{ balance?: number } | undefined>(
          tx.objectStore(DbStore.Customers).get(payload.customerId),
        );
        if (!customer) throw new Error('Customer not found. It may have been deleted.');
        const previousBalance = customer.balance ?? 0;
        let balanceAfter = previousBalance;
        if (payload.total > 0) {
          const billed = await addLedgerEntry(tx, {
            customerId: payload.customerId,
            type: LedgerType.Bill,
            amount: payload.total,
            referenceId: billId,
            systemRemark: 'Bill ' + no,
          });
          balanceAfter = billed.entry.balanceAfter;
        }
        if (payload.paidAmount > 0) {
          const paid = await addLedgerEntry(tx, {
            customerId: payload.customerId,
            type: LedgerType.PaymentIn,
            amount: payload.paidAmount,
            mode: paymentMode,
            referenceId: billId,
            systemRemark: 'Payment received with bill ' + no,
          });
          balanceAfter = paid.entry.balanceAfter;
        }

        const bill: IBill = stamp(
          {
            ...header,
            no,
            status: BillStatus.Issued,
            costTotal: roundMoney(costTotal),
            itemCount: lines.length,
            previousBalance,
            balanceAfter,
          },
          { id: billId },
        );
        await idbRequest(tx.objectStore(DbStore.Bills).add(bill));
        for (const item of itemRows) {
          await idbRequest(tx.objectStore(DbStore.BillItems).add(item));
        }
        await pruneCustomerBills(tx, payload.customerId);
        return bill;
      },
    );
  }

  deleteDraftBill(id: string): Observable<void> {
    return this.db.transaction([DbStore.Bills, DbStore.BillItems], 'readwrite', async (tx) => {
      await this.removeDraft(tx, id);
    });
  }

  private async removeDraft(tx: IDBTransaction, id: string): Promise<IBill> {
    const bill = await idbRequest<IBill | undefined>(tx.objectStore(DbStore.Bills).get(id));
    if (!bill || bill.status !== BillStatus.Draft) {
      throw new Error('This draft is already issued or deleted');
    }
    const items = tx.objectStore(DbStore.BillItems);
    const keys = await idbRequest<IDBValidKey[]>(items.index('billId').getAllKeys(id));
    for (const key of keys) await idbRequest(items.delete(key));
    await idbRequest(tx.objectStore(DbStore.Bills).delete(id));
    return bill;
  }
}

function itemRow(billId: string, line: ICartLine, cost: number): IBillItem {
  return stamp({
    billId,
    productId: line.productId,
    name: line.name,
    localName: line.localName,
    categoryName: line.categoryName,
    qty: line.qty,
    rate: line.rate,
    cost,
    amount: roundMoney(line.qty * line.rate),
    ...(line.unit ? { unit: line.unit, factor: line.factor ?? 1 } : {}),
  });
}

// Next serial after the highest issued number of the bill's financial year; worked out inside
// the saving transaction, so two bills can never get the same number
async function nextBillNo(tx: IDBTransaction, date: Date): Promise<string> {
  const prefix = billNoPrefix(date);
  const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
  const cursor = await idbRequest(
    tx.objectStore(DbStore.Bills).index('no').openCursor(range, 'prev'),
  );
  const last = cursor ? Number((cursor.value as IBill).no.slice(prefix.length)) || 0 : 0;
  return formatBillNo(prefix, last + 1);
}
