import { BillLanguage, BillStatus, DiscountType, IBaseEntity } from 'src/app/core.index';
import { ICustomer } from '../customer-management/customer-management.interface';

export interface ICartLine {
  productId: string;
  name: string;
  localName: string;
  rate: number;
  cost: number;
  qty: number;
}

export interface IBillRequestModel {
  no: string;
  date: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discount: number;
  total: number;
  status: BillStatus;
  paidAmount: number;
  printLanguage: BillLanguage;
  items: ICartLine[];
}

export interface IBill extends IBaseEntity, Omit<IBillRequestModel, 'items'> {
  costTotal: number;
  itemCount: number;
}

export interface IBillItem extends IBaseEntity {
  billId: string;
  productId: string;
  name: string;
  localName: string;
  qty: number;
  rate: number;
  cost: number;
  amount: number;
}

// Unsaved bill kept on this device, so a reload or crash never loses a half-made bill
export interface IBillDraft {
  cart: ICartLine[];
  customer: ICustomer | null;
  billDate: string;
  discountType: DiscountType;
  discountValue: number | null;
  status: BillStatus;
  received: number | null;
  printLanguage: BillLanguage;
  savedAt: string;
}

export interface IBillWithItems extends IBill {
  items: IBillItem[];
}
