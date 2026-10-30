import {
  CostingMethod,
  IBaseEntity,
  IInventoryBatch,
  IPriceHistory,
  IStockMovement,
} from 'src/app/core.index';

export interface IProduct extends IBaseEntity {
  name: string;
  localName: string;
  shortName: string;
  categoryId: string;
  // Last purchase cost per unit
  buyPrice: number;
  // Running weighted average cost per unit of the stock in hand
  avgCost: number;
  sellPrice: number;
  stock: number;
}

// For a new product, stock and buyPrice are the opening stock and its cost per unit
export type ProductRequestModel = Omit<IProduct, keyof IBaseEntity | 'avgCost'>;

export enum StockDirection {
  In = 'in',
  Out = 'out',
}

export interface IStockAdjustmentModel {
  direction: StockDirection;
  qty: number;
  unitCost: number;
  note: string;
}

export interface IStockDetail {
  batches: IInventoryBatch[];
  movements: IStockMovement[];
  prices: IPriceHistory[];
}

export interface IStockValuation {
  method: CostingMethod;
  byProduct: Record<string, number>;
  total: number;
}
