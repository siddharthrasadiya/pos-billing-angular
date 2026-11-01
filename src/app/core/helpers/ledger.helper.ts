import { DbStore } from '../enums/db-store.enum';
import { SHOP_SETTINGS_ID } from '../constants/db.constant';
import { BillStatus } from '../enums/bill-status.enum';
import {
  DEBIT_TYPES,
  DEFAULT_CUSTOMER_BILL_LIMIT,
  DEFAULT_STATEMENT_LIMIT,
  LedgerType,
  PaymentMode,
  WALK_IN_CUSTOMER_ID,
  WALK_IN_CUSTOMER_NAME,
} from '../enums/ledger.enum';
import { BillLanguage } from '../enums/bill-language.enum';
import { IBaseEntity, ILedgerEntry, IShopSettingsEntity } from '../models/models';
import { idbRequest } from '../service/database.service';
import { roundMoney } from './bill.helper';
import { stamp } from './entity.helper';
import { formatAmount } from './format.helper';

// Every account change runs inside the caller's transaction with these stores, so the entry and
// the customer's balance are always saved together (Settings: how many entries to keep)
export const LEDGER_STORES = [DbStore.Customers, DbStore.CustomerLedger, DbStore.Settings];

const LEDGER_PREFIX = 'TX';

export function formatLedgerNo(serial: number): string {
  return LEDGER_PREFIX + String(serial).padStart(6, '0');
}

export function walkInCustomer() {
  const now = new Date().toISOString();
  return {
    id: WALK_IN_CUSTOMER_ID,
    name: WALK_IN_CUSTOMER_NAME,
    mobile: '',
    contacts: [],
    categoryId: '',
    billLanguage: BillLanguage.English,
    email: '',
    gstin: '',
    address: '',
    balance: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// Plus = the customer owes this much (due), minus = paid in advance
export function balanceLabel(balance: number): string {
  if (balance > 0) return 'Due ' + formatAmount(balance);
  if (balance < 0) return 'Advance ' + formatAmount(-balance);
  return 'No due';
}

interface ICustomerRow extends IBaseEntity {
  balance?: number;
}

export interface ILedgerChange {
  customerId: string;
  type: LedgerType;
  amount: number;
  systemRemark: string;
  userRemark?: string;
  mode?: PaymentMode | '';
  referenceId?: string;
}

async function nextLedgerNo(tx: IDBTransaction): Promise<string> {
  const cursor = await idbRequest(
    tx.objectStore(DbStore.CustomerLedger).index('no').openCursor(null, 'prev'),
  );
  const last = cursor ? Number((cursor.value as ILedgerEntry).no.slice(LEDGER_PREFIX.length)) : 0;
  return formatLedgerNo((last || 0) + 1);
}

export async function addLedgerEntry(
  tx: IDBTransaction,
  change: ILedgerChange,
): Promise<{ entry: ILedgerEntry; balanceBefore: number }> {
  const amount = roundMoney(change.amount);
  if (!(amount > 0)) throw new Error('Amount must be more than 0');
  const customers = tx.objectStore(DbStore.Customers);
  const customer = await idbRequest<ICustomerRow | undefined>(customers.get(change.customerId));
  if (!customer) throw new Error('Customer not found. It may have been deleted.');

  const balanceBefore = customer.balance ?? 0;
  const balanceAfter = roundMoney(
    balanceBefore + (DEBIT_TYPES.has(change.type) ? amount : -amount),
  );
  const entry: ILedgerEntry = stamp({
    customerId: change.customerId,
    no: await nextLedgerNo(tx),
    type: change.type,
    amount,
    balanceAfter,
    mode: change.mode ?? '',
    referenceId: change.referenceId ?? '',
    systemRemark: change.systemRemark,
    userRemark: (change.userRemark ?? '').trim(),
  });
  await idbRequest(tx.objectStore(DbStore.CustomerLedger).add(entry));
  await idbRequest(customers.put(stamp({ ...customer, balance: balanceAfter }, customer)));
  await pruneLedger(tx, change.customerId, (await customerLimits(tx)).statement);
  return { entry, balanceBefore };
}

async function customerLimits(tx: IDBTransaction): Promise<{ statement: number; bills: number }> {
  const shop = await idbRequest<IShopSettingsEntity | undefined>(
    tx.objectStore(DbStore.Settings).get(SHOP_SETTINGS_ID),
  );
  return {
    statement: shop?.statementLimit || DEFAULT_STATEMENT_LIMIT,
    bills: shop?.customerBillLimit || DEFAULT_CUSTOMER_BILL_LIMIT,
  };
}

// Newest entries stay (by transaction number); older ones are deleted for good. The balance is
// stored on the customer and on every entry, so it stays right
async function pruneLedger(tx: IDBTransaction, customerId: string, keep: number): Promise<void> {
  const store = tx.objectStore(DbStore.CustomerLedger);
  const range = IDBKeyRange.bound([customerId, ''], [customerId, '\uffff']);
  const entries = await idbRequest<ILedgerEntry[]>(store.index('customerCreated').getAll(range));
  if (entries.length <= keep) return;
  entries.sort((a, b) => b.no.localeCompare(a.no));
  for (const entry of entries.slice(keep)) await idbRequest(store.delete(entry.id));
}

// Newest issued/cancelled bills stay; drafts are never removed automatically
export async function pruneCustomerBills(tx: IDBTransaction, customerId: string): Promise<void> {
  const keep = (await customerLimits(tx)).bills;
  const bills = tx.objectStore(DbStore.Bills);
  const rows = await idbRequest<{ id: string; date: string; createdAt: string; status: string }[]>(
    bills.index('customerId').getAll(customerId),
  );
  const done = rows.filter((b) => b.status !== BillStatus.Draft);
  if (done.length <= keep) return;
  done.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const items = tx.objectStore(DbStore.BillItems);
  for (const bill of done.slice(keep)) {
    const keys = await idbRequest<IDBValidKey[]>(items.index('billId').getAllKeys(bill.id));
    for (const key of keys) await idbRequest(items.delete(key));
    await idbRequest(bills.delete(bill.id));
  }
}

// Used when the limits are lowered in Settings (needs Settings, ledger, Bills and BillItems)
export async function pruneCustomerHistory(tx: IDBTransaction, customerId: string): Promise<void> {
  await pruneLedger(tx, customerId, (await customerLimits(tx)).statement);
  await pruneCustomerBills(tx, customerId);
}
