import { IBaseEntity } from 'src/app/core.index';

// Ordered: placed with the supplier, no stock yet, still editable
// Received: goods arrived and went into stock (possibly fewer than ordered)
// Cancelled: order dropped, or a received purchase undone before its stock was sold
export enum PurchaseStatus {
  Ordered = 'ordered',
  Received = 'received',
  Cancelled = 'cancelled',
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  [PurchaseStatus.Ordered]: 'Ordered',
  [PurchaseStatus.Received]: 'Received',
  [PurchaseStatus.Cancelled]: 'Cancelled',
};

export interface IPurchaseLine {
  productId: string;
  name: string;
  qty: number;
  unitCost: number;
  sellPrice: number | null;
  // Unit the line is bought in and how many base units one of it adds to stock
  unit?: string;
  factor?: number;
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
  // Ordered value; receivedTotal is what actually came in
  total: number;
  receivedTotal: number;
  itemCount: number;
  status: PurchaseStatus;
  receivedAt: string;
  // When it became Received or Cancelled; auto-delete counts from here
  closedAt: string;
}

export interface IPurchaseItem extends IBaseEntity, IPurchaseLine {
  purchaseId: string;
  amount: number;
  receivedQty: number | null;
}

export interface IPurchaseWithItems extends IPurchase {
  items: IPurchaseItem[];
}

// itemId -> quantity that actually arrived
export type ReceivedQuantities = Record<string, number>;
