// A product is low on stock at or below this many primary units, unless set on the product
export const DEFAULT_MIN_STOCK = 10;

// Per product; older entries are deleted permanently to keep backups small
export const DEFAULT_HISTORY_LIMIT = 5;
export const MIN_HISTORY_LIMIT = 5;
export const MAX_HISTORY_LIMIT = 50;

// Received and cancelled purchases are deleted this many days after they close
export const DEFAULT_PURCHASE_RETENTION_DAYS = 30;
export const MIN_PURCHASE_RETENTION_DAYS = 5;
export const MAX_PURCHASE_RETENTION_DAYS = 365;

export enum BatchSource {
  Opening = 'opening',
  Purchase = 'purchase',
  Adjustment = 'adjustment',
  Return = 'return',
}

export const BATCH_SOURCE_LABELS: Record<BatchSource, string> = {
  [BatchSource.Opening]: 'Opening stock',
  [BatchSource.Purchase]: 'Purchase',
  [BatchSource.Adjustment]: 'Stock added',
  [BatchSource.Return]: 'Returned from bill',
};

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
