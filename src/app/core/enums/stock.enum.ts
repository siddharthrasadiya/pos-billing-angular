export enum CostingMethod {
  Fifo = 'fifo',
  Average = 'average',
}

// Used when the shop has not picked a costing method in Settings
export const DEFAULT_COSTING_METHOD = CostingMethod.Fifo;

export const COSTING_METHOD_OPTIONS = [
  {
    id: CostingMethod.Fifo,
    name: 'FIFO',
    detail: 'Oldest stock is sold first, at the price it was bought for',
  },
  {
    id: CostingMethod.Average,
    name: 'Weighted average',
    detail: 'Every sale uses the average purchase cost of the stock in hand',
  },
];

export enum BatchSource {
  Opening = 'opening',
  Purchase = 'purchase',
  Adjustment = 'adjustment',
  Return = 'return',
}

export enum StockMovementType {
  Opening = 'opening',
  Purchase = 'purchase',
  PurchaseCancel = 'purchase-cancel',
  Sale = 'sale',
  SaleCancel = 'sale-cancel',
  AdjustmentIn = 'adjustment-in',
  AdjustmentOut = 'adjustment-out',
}

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  [StockMovementType.Opening]: 'Opening stock',
  [StockMovementType.Purchase]: 'Purchase',
  [StockMovementType.PurchaseCancel]: 'Purchase cancelled',
  [StockMovementType.Sale]: 'Sale',
  [StockMovementType.SaleCancel]: 'Sale cancelled',
  [StockMovementType.AdjustmentIn]: 'Stock added',
  [StockMovementType.AdjustmentOut]: 'Stock removed',
};
