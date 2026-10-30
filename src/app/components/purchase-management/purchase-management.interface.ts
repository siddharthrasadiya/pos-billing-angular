import { IBaseEntity } from 'src/app/core.index';

export enum PurchaseStatus {
  Active = 'active',
  Cancelled = 'cancelled',
}

export interface IPurchaseLine {
  productId: string;
  name: string;
  qty: number;
  unitCost: number;
  sellPrice: number | null;
}

export interface IPurchaseRequestModel {
  date: string;
  supplierName: string;
  note: string;
  items: IPurchaseLine[];
}

export interface IPurchase extends IBaseEntity {
  date: string;
  supplierName: string;
  note: string;
  total: number;
  itemCount: number;
  status: PurchaseStatus;
}

export interface IPurchaseItem extends IBaseEntity, IPurchaseLine {
  purchaseId: string;
  amount: number;
}

export interface IPurchaseWithItems extends IPurchase {
  items: IPurchaseItem[];
}
