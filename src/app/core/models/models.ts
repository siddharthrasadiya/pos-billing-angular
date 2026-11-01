import { LedgerType, PaymentMode } from '../enums/ledger.enum';

export interface IBaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICategory extends IBaseEntity {
  name: string;
}

export interface IShopSettings {
  name: string;
  address: string;
  gst: string;
  // How many selling price changes and stock movements to keep per product
  priceHistoryLimit: number;
  movementHistoryLimit: number;
  purchaseRetentionDays: number;
  // Newest statement entries and bills kept per customer
  statementLimit: number;
  customerBillLimit: number;
}

export interface IShopSettingsEntity extends IBaseEntity, IShopSettings {}

export interface IReceiptItem {
  name: string;
  localName?: string;
  qty: number;
  rate: number;
  unit?: string;
}

export interface IReceiptBill {
  no: string;
  date: string;
  total: number;
  items: IReceiptItem[];
  customerName?: string;
  customerMobile?: string;
  subtotal?: number;
  discount?: number;
  // Received with this bill (a separate payment entry in the customer statement)
  paidAmount?: number;
  // Customer account just before and just after this bill (and its received amount)
  previousBalance?: number;
  balanceAfter?: number;
  status?: string;
  printLanguage?: string;
}

export interface ILedgerEntry extends IBaseEntity {
  customerId: string;
  no: string;
  type: LedgerType;
  amount: number;
  balanceAfter: number;
  mode: PaymentMode | '';
  referenceId: string;
  systemRemark: string;
  userRemark: string;
}
