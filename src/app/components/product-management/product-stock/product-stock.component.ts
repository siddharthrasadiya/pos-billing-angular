import { Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  BATCH_SOURCE_LABELS,
  money,
  STOCK_MOVEMENT_LABELS,
  StockMovementType,
  ToastersService,
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
  @Input() set product(value: IProduct | null) {
    this.current.set(value);
    this.detail.set(null);
    this.resetForm();
    if (value) this.getDetail(value.id);
  }
  @Input() stockValue: number = 0;
  @Output() changed: EventEmitter<void> = new EventEmitter();

  readonly money = money;
  readonly movementLabels = STOCK_MOVEMENT_LABELS;
  readonly sourceLabels = BATCH_SOURCE_LABELS;
  readonly StockDirection = StockDirection;
  readonly current = signal<IProduct | null>(null);
  readonly detail = signal<IStockDetail | null>(null);
  readonly direction = signal(StockDirection.In);
  readonly openBatches = computed(() => (this.detail()?.batches ?? []).filter((b) => b.remainingQty > 0));

  readonly form = new FormGroup({
    qty: new FormControl<number | null>(null),
    unitCost: new FormControl<number | null>(null),
    note: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private productManagementService: ProductManagementService,
    private toasters: ToastersService,
  ) {}

  getDetail(productId: string): void {
    this.productManagementService.getStockDetail(productId).subscribe({
      next: (detail) => this.detail.set(detail),
      error: (err) => this.toasters.error('Could not load stock history: ' + err.message),
    });
  }

  isIncoming(type: StockMovementType): boolean {
    return [
      StockMovementType.Opening,
      StockMovementType.Purchase,
      StockMovementType.SaleCancel,
      StockMovementType.AdjustmentIn,
    ].includes(type);
  }

  setDirection(direction: StockDirection): void {
    this.direction.set(direction);
  }

  adjust(): void {
    const product = this.current();
    const { qty, unitCost, note } = this.form.getRawValue();
    if (!product || !qty || qty <= 0) {
      this.toasters.warn('Enter quantity');
      return;
    }
    if (this.direction() === StockDirection.Out && qty > product.stock) {
      this.toasters.warn(`Only ${product.stock} in stock`);
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
        unitCost: unitCost ?? product.buyPrice,
        note: note.trim(),
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

  private resetForm(): void {
    this.direction.set(StockDirection.In);
    this.form.reset({ qty: null, unitCost: this.current()?.buyPrice ?? null, note: '' });
  }
}
