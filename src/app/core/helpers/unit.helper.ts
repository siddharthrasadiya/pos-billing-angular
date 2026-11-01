import { DEFAULT_MIN_STOCK } from '../enums/stock.enum';
import { DEFAULT_UNIT } from '../enums/unit.enum';

// Stock, batches and movements are counted in the smallest unit (the secondary unit when there is
// one), so boxes and loose pieces never get mixed up. Prices on the product are per primary unit
export interface IProductUnits {
  unit?: string;
  subUnit?: string;
  unitFactor?: number;
}

export interface IStockLevel extends IProductUnits {
  stock: number;
  // In primary units
  minStock?: number;
}

export function minStockOf(product: IStockLevel): number {
  return product.minStock ?? DEFAULT_MIN_STOCK;
}

export function isLowStock(product: IStockLevel): boolean {
  return product.stock <= minStockOf(product) * unitFactor(product);
}

export function mainUnit(product: IProductUnits): string {
  return product.unit || DEFAULT_UNIT;
}

// How many secondary units make one primary unit; 1 when there is no secondary unit
export function unitFactor(product: IProductUnits): number {
  return product.subUnit && (product.unitFactor ?? 0) > 1 ? product.unitFactor! : 1;
}

export function hasSubUnit(product: IProductUnits): boolean {
  return unitFactor(product) > 1;
}

// The unit stock is counted in
export function baseUnit(product: IProductUnits): string {
  return hasSubUnit(product) ? product.subUnit! : mainUnit(product);
}

// 70 pieces of a 30-piece box: "2 box 10 pcs"
export function formatStock(qty: number, product: IProductUnits): string {
  const factor = unitFactor(product);
  if (factor === 1) return `${qty} ${mainUnit(product)}`;
  const sign = qty < 0 ? '-' : '';
  const abs = Math.abs(qty);
  const whole = Math.floor(abs / factor);
  const loose = abs % factor;
  const parts: string[] = [];
  if (whole) parts.push(`${whole} ${mainUnit(product)}`);
  if (loose || !whole) parts.push(`${loose} ${product.subUnit}`);
  return sign + parts.join(' ');
}

export function unitLabel(product: IProductUnits): string {
  return hasSubUnit(product)
    ? `1 ${mainUnit(product)} = ${unitFactor(product)} ${product.subUnit}`
    : mainUnit(product);
}

// Base units in one of the given unit, or null when the product no longer has that unit
// (its units were changed after the line was made)
export function factorOf(product: IProductUnits, unit: string | undefined): number | null {
  if (!unit) return 1;
  if (unit === mainUnit(product)) return unitFactor(product);
  if (unit === baseUnit(product)) return 1;
  return null;
}
