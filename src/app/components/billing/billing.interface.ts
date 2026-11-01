import { BillLanguage, BillStatus, DiscountType, IBaseEntity, IStockLot } from 'src/app/core.index';
import { ICustomer } from '../customer-management/customer-management.interface';

export interface ICartLine {
  // A product can be on the bill more than once (e.g. once as a free item), so lines have their own id
  lineId: string;
  productId: string;
  name: string;
  localName: string;
  categoryName: string;
  rate: number;
  cost: number;
  qty: number;
  // Unit the line is sold in and how many base units one of it takes from stock
  unit?: string;
  factor?: number;
}

export interface IBillRequestModel {
  date: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discount: number;
  total: number;
  // Received at the counter with this bill; saved as its own statement entry
  paidAmount: number;
  printLanguage: BillLanguage;
  items: ICartLine[];
}

export interface IBill extends IBaseEntity, Omit<IBillRequestModel, 'items'> {
  // Drafts get "DRAFT-..."; the real number is given when the bill is issued
  no: string;
  status: BillStatus;
  costTotal: number;
  itemCount: number;
  // Customer account just before and after this bill, for the receipt
  previousBalance?: number;
  balanceAfter?: number;
}

export interface IBillItem extends IBaseEntity {
  billId: string;
  productId: string;
  name: string;
  localName: string;
  categoryName?: string;
  qty: number;
  rate: number;
  cost: number;
  amount: number;
  unit?: string;
  factor?: number;
  // Stock lots this line was sold from, to put stock back exactly if the bill is cancelled
  lots?: IStockLot[];
}

// Unsaved bill kept on this device, so a reload or crash never loses a half-made bill
export interface IBillDraft {
  cart: ICartLine[];
  customer: ICustomer | null;
  // Set while editing a saved draft bill, so saving updates it instead of making a new one
  draftId: string | null;
  billDate: string;
  discountType: DiscountType;
  discountValue: number | null;
  received: number | null;
  printLanguage: BillLanguage;
  savedAt: string;
}

export interface IBillWithItems extends IBill {
  items: IBillItem[];
}
