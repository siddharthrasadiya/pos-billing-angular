// Draft: saved order, no number, no stock or account change. Issued: numbered, stock goes out and
// the total is added to the customer's account. Payments live in the customer statement, not on bills
export enum BillStatus {
  Draft = 'draft',
  Issued = 'issued',
  Cancelled = 'cancelled',
}

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  [BillStatus.Draft]: 'Draft',
  [BillStatus.Issued]: 'Issued',
  [BillStatus.Cancelled]: 'Cancelled',
};

export enum DiscountType {
  Amount = 'amount',
  Percent = 'percent',
}
