import { Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  BATCH_SOURCE_LABELS,
  baseUnit,
  formatStock,
  hasSubUnit,
  mainUnit,
  MAX_PRICE,
  MAX_QTY,
  money,
  roundMoney,
  STOCK_MOVEMENT_LABELS,
  ToastersService,
  unitFactor,
  SecurityService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { IProduct, IStockDetail, StockDirection } from '../product-management.interface';
import { ProductManagementService } from '../product-management.service';

@Component({
  selector: 'app-product-stock',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './product-stock.component.html',
  styleUrl: './product-stock.component.scss',
})
export class ProductStockComponent {
  readonly maxPrice = MAX_PRICE;
  readonly maxQty = MAX_QTY;
  @Input() set product(value: IProduct | null) {
    this.current.set(value);
    this.detail.set(null);
    this.resetForm();
    if (value) this.getDetail(value.id);
  }
  @Input() stockValue: number = 0;
  @Output() changed: EventEmitter<void> = new EventEmitter();

  readonly money = money;
  readonly abs = Math.abs;
  readonly movementLabels = STOCK_MOVEMENT_LABELS;
  readonly sourceLabels = BATCH_SOURCE_LABELS;
  readonly StockDirection = StockDirection;
  readonly current = signal<IProduct | null>(null);
  readonly detail = signal<IStockDetail | null>(null);
  readonly direction = signal(StockDirection.In);
  // Adjust in the primary unit, or in the secondary unit for loose pieces
  readonly useSubUnit = signal(false);
  readonly units = computed(() => {
    const p = this.current();
    if (!p) return null;
    return {
      main: mainUnit(p),
      sub: p.subUnit ?? '',
      base: baseUnit(p),
      factor: unitFactor(p),
      hasSub: hasSubUnit(p),
    };
  });
  readonly entryUnit = computed(() => {
    const u = this.units();
    return !u ? '' : this.useSubUnit() && u.hasSub ? u.sub : u.main;
  });
  private readonly entryFactor = computed(() =>
    this.useSubUnit() ? 1 : (this.units()?.factor ?? 1),
  );
  readonly openBatches = computed(() =>
    (this.detail()?.batches ?? []).filter((b) => b.remainingQty > 0),
  );

  readonly form = new FormGroup({
    qty: new FormControl<number | null>(null),
    unitCost: new FormControl<number | null>(null),
    note: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private productManagementService: ProductManagementService,
    private security: SecurityService,
    private toasters: ToastersService,
  ) {}

  getDetail(productId: string): void {
    this.productManagementService.getStockDetail(productId).subscribe({
      next: (detail) => this.detail.set(detail),
      error: (err) => this.toasters.error('Could not load stock history: ' + err.message),
    });
  }

  setDirection(direction: StockDirection): void {
    this.direction.set(direction);
  }

  setSubUnit(useSub: boolean): void {
    this.useSubUnit.set(useSub);
    this.form.controls.unitCost.setValue(this.defaultCost());
  }

  stockText(qty: number): string {
    const p = this.current();
    return p ? formatStock(qty, p) : String(qty);
  }

  // Batches and movements keep cost per base unit; shown per primary unit, as it is bought
  costText(unitCost: number): string {
    const u = this.units();
    return u ? `${money(unitCost * u.factor)} / ${u.main}` : money(unitCost);
  }

  async adjust(): Promise<void> {
    if (!(await this.security.allow('change stock'))) return;
    const product = this.current();
    const { qty, unitCost, note } = this.form.getRawValue();
    if (!product || !qty || qty <= 0) {
      this.toasters.warn('Enter quantity');
      return;
    }
    const factor = this.entryFactor();
    if (this.direction() === StockDirection.Out && qty * factor > product.stock) {
      this.toasters.warn(`Only ${formatStock(product.stock, product)} in stock`);
      return;
    }
    if (!note.trim()) {
      this.toasters.warn('Enter a reason, for example damaged or counted');
      return;
    }
    this.productManagementService
      .adjustStock(product.id, {
        direction: this.direction(),
        qty,
        unitCost: unitCost ?? this.defaultCost() ?? 0,
        note: note.trim(),
        factor,
      })
      .subscribe({
        next: () => {
          this.toasters.success('Stock updated');
          this.resetForm();
          this.changed.emit();
        },
        error: (err) => this.toasters.error('Could not update stock: ' + err.message),
      });
  }

  private defaultCost(): number | null {
    const p = this.current();
    return p ? roundMoney(p.buyPrice * this.entryFactor()) : null;
  }

  private resetForm(): void {
    this.direction.set(StockDirection.In);
    this.useSubUnit.set(false);
    this.form.reset({ qty: null, unitCost: this.defaultCost(), note: '' });
  }
}
