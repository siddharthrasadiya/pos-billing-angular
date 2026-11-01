import {
  IBaseEntity,
  IInventoryBatch,
  IPriceHistory,
  IProductUnits,
  IStockMovement,
} from 'src/app/core.index';

// stock and buyPrice (last purchase cost) are per smallest unit; sellPrice is per primary unit
export interface IProduct extends IBaseEntity, IProductUnits {
  name: string;
  localName: string;
  shortName: string;
  categoryId: string;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  // Low stock alert at or below this many primary units; DEFAULT_MIN_STOCK when not set
  minStock?: number;
}

// For a new product, stock and buyPrice are the opening stock and its cost per unit
export type ProductRequestModel = Omit<IProduct, keyof IBaseEntity>;

export enum StockDirection {
  In = 'in',
  Out = 'out',
}

export interface IStockAdjustmentModel {
  direction: StockDirection;
  qty: number;
  unitCost: number;
  note: string;
  // Base units in one entered unit: the box size when entered in boxes, else 1
  factor: number;
}

export interface IStockDetail {
  batches: IInventoryBatch[];
  movements: IStockMovement[];
  prices: IPriceHistory[];
}

export interface IStockValuation {
  byProduct: Record<string, number>;
  total: number;
}
