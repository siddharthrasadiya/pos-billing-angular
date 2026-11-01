// Customer account entries. Debit (Dr) raises what the customer owes, credit (Cr) lowers it.
// Entries are never edited or deleted; a mistake is fixed with an opposite entry
export enum LedgerType {
  Bill = 'bill',
  BillCancel = 'bill-cancel',
  PaymentIn = 'payment-in',
  PaymentOut = 'payment-out',
}

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  [LedgerType.Bill]: 'Bill',
  [LedgerType.BillCancel]: 'Bill cancelled',
  [LedgerType.PaymentIn]: 'Payment received',
  [LedgerType.PaymentOut]: 'Amount given back',
};

export const DEBIT_TYPES: ReadonlySet<LedgerType> = new Set([
  LedgerType.Bill,
  LedgerType.PaymentOut,
]);

export enum PaymentMode {
  Cash = 'cash',
  Upi = 'upi',
  Bank = 'bank',
  Cheque = 'cheque',
}

export const PAYMENT_MODE_OPTIONS = [
  { id: PaymentMode.Cash, name: 'Cash' },
  { id: PaymentMode.Upi, name: 'UPI' },
  { id: PaymentMode.Bank, name: 'Bank' },
  { id: PaymentMode.Cheque, name: 'Cheque' },
];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  [PaymentMode.Cash]: 'Cash',
  [PaymentMode.Upi]: 'UPI',
  [PaymentMode.Bank]: 'Bank',
  [PaymentMode.Cheque]: 'Cheque',
};

// Built-in customer for counter sales; it has an account like any shop and cannot be deleted
export const WALK_IN_CUSTOMER_ID = 'walk-in';
export const WALK_IN_CUSTOMER_NAME = 'Walk-in customer';

// How much history to keep per customer; older statement entries and bills are deleted for good
// (the balance is stored on the customer, so it stays correct)
export const DEFAULT_STATEMENT_LIMIT = 50;
export const DEFAULT_CUSTOMER_BILL_LIMIT = 50;
export const MIN_CUSTOMER_LIMIT = 10;
export const MAX_CUSTOMER_LIMIT = 500;
