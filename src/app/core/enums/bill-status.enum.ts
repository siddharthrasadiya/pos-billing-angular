export enum BillStatus {
  Issued = 'issued',
  Paid = 'paid',
  Partial = 'partial',
  Cancelled = 'cancelled',
}

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  [BillStatus.Issued]: 'Issued',
  [BillStatus.Paid]: 'Paid',
  [BillStatus.Partial]: 'Partially paid',
  [BillStatus.Cancelled]: 'Cancelled',
};

export enum DiscountType {
  Amount = 'amount',
  Percent = 'percent',
}
