import { BillStatus, DiscountType } from '../enums/bill-status.enum';

// Plain Math.round(n * 100) / 100 turns 1.005 into 1.00, because 1.005 * 100 is 100.4999...
// in floating point; nudging by one EPSILON step rounds such halves up as expected
export function roundMoney(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 * (1 + Number.EPSILON))) / 100;
}

// Adds amounts and rounds once at the end, so totals never show 0.30000000000000004
export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((sum, v) => sum + v, 0));
}

export function discountAmount(subtotal: number, type: DiscountType, value: number): number {
  const raw = type === DiscountType.Percent ? (subtotal * value) / 100 : value;
  return Math.min(subtotal, Math.max(0, roundMoney(raw)));
}

export function statusFromPayment(total: number, paid: number): BillStatus {
  if (paid >= total) return BillStatus.Paid;
  if (paid > 0) return BillStatus.Partial;
  return BillStatus.Issued;
}
