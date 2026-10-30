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
}

export interface IPriceHistory extends IBaseEntity {
  productId: string;
  sellPrice: number;
  date: string;
}
