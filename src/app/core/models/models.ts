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
}

export interface IShopSettingsEntity extends IBaseEntity, IShopSettings {}

export interface IReceiptItem {
  name: string;
  qty: number;
  rate: number;
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
  paidAmount?: number;
  status?: string;
}
