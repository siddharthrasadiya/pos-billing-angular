import { BatchSource, StockMovementType } from '../enums/stock.enum';
import { IBaseEntity } from './models';

// One lot of stock bought at one cost; sales consume the oldest lots first (FIFO)
export interface IInventoryBatch extends IBaseEntity {
  productId: string;
  source: BatchSource;
  referenceId: string;
  date: string;
  initialQty: number;
  remainingQty: number;
  unitCost: number;
}

export interface IStockMovement extends IBaseEntity {
  productId: string;
  batchId: string;
  type: StockMovementType;
  qty: number;
  unitCost: number;
  referenceId: string;
  date: string;
  note: string;
  // Daily sales row: how many bills it adds up (one row per product per day)
  billCount?: number;
  // Last bill added to the daily row, so two lines of one bill (box and pcs) count as one bill
  lastBillId?: string;
}

// Part of a sale taken from one lot; kept on the bill line to undo a cancelled bill exactly
export interface IStockLot {
  batchId: string;
  qty: number;
  unitCost: number;
}

export interface IPriceHistory extends IBaseEntity {
  productId: string;
  sellPrice: number;
  date: string;
}
