import { BillStatus, DiscountType, IBaseEntity } from 'src/app/core.index';

export interface ICartLine {
  productId: string;
  name: string;
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
  qty: number;
  rate: number;
  cost: number;
  amount: number;
}

export interface IBillWithItems extends IBill {
  items: IBillItem[];
}
