import { BillStatus, DiscountType } from '../enums/bill-status.enum';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
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
