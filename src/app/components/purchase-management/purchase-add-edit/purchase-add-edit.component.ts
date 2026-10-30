import { Component, computed, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { money, roundMoney, ToastersService } from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { IProduct } from '../../product-management/product-management.interface';
import { ProductManagementService } from '../../product-management/product-management.service';
import { IPurchase, IPurchaseLine } from '../purchase-management.interface';
import { PurchaseManagementService } from '../purchase-management.service';

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

@Component({
  selector: 'app-purchase-add-edit',
  imports: [ReactiveFormsModule, CustomElementModule, IconComponent],
  templateUrl: './purchase-add-edit.component.html',
  styleUrl: './purchase-add-edit.component.scss',
})
export class PurchaseAddEditComponent implements OnInit {
  @Output() saved: EventEmitter<IPurchase> = new EventEmitter();
  @Output() cancelled: EventEmitter<void> = new EventEmitter();

  readonly money = money;
  readonly today = new Date();
  readonly products = signal<IProduct[]>([]);
  readonly lines = signal<IPurchaseLine[]>([]);
  readonly total = computed(() =>
    roundMoney(this.lines().reduce((sum, l) => sum + l.qty * l.unitCost, 0)),
  );
  readonly productOptions = computed(() =>
    [...this.products()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ id: p.id, name: `${p.name} (stock ${p.stock})` })),
  );

  readonly form = new FormGroup({
    date: new FormControl<Date | null>(startOfToday(), [Validators.required]),
    supplierName: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
  });
  readonly lineForm = new FormGroup({
    productId: new FormControl<string | null>(null),
    qty: new FormControl<number | null>(null),
    unitCost: new FormControl<number | null>(null),
    sellPrice: new FormControl<number | null>(null),
  });

  constructor(
    private purchaseManagementService: PurchaseManagementService,
    private productManagementService: ProductManagementService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getProducts();
  }

  getProducts(): void {
    this.productManagementService.getProductList().subscribe({
      next: (products) => this.products.set(products),
      error: (err) => this.toasters.error('Could not load products: ' + err.message),
    });
  }

  // Picking a product pre-fills its last cost and current selling price
  onProductChange(): void {
    const product = this.findProduct(this.lineForm.controls.productId.value);
    this.lineForm.patchValue({
      unitCost: product?.buyPrice ?? null,
      sellPrice: product?.sellPrice ?? null,
    });
  }

  addLine(): void {
    const { productId, qty, unitCost, sellPrice } = this.lineForm.getRawValue();
    const product = this.findProduct(productId);
    if (!product || !qty || qty <= 0 || unitCost === null || unitCost < 0) {
      this.toasters.warn('Pick a product and enter quantity and buying price');
      return;
    }
    this.lines.update((lines) => [
      ...lines,
      {
        productId: product.id,
        name: product.name,
        qty,
        unitCost: roundMoney(unitCost),
        sellPrice: sellPrice === null || sellPrice === product.sellPrice ? null : roundMoney(sellPrice),
      },
    ]);
    this.lineForm.reset();
  }

  removeLine(index: number): void {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  save(): void {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (!value.date) {
      this.toasters.warn('Pick the purchase date');
      return;
    }
    if (!this.lines().length) {
      this.toasters.warn('Add at least one item');
      return;
    }
    this.purchaseManagementService
      .savePurchase({
        date: customDatetime(this.dateWithCurrentTime(value.date), { get: 'UTC' }),
        supplierName: value.supplierName.trim(),
        note: value.note.trim(),
        items: this.lines(),
      })
      .subscribe({
        next: (purchase) => {
          this.toasters.success('Purchase saved, stock added');
          this.resetForm();
          this.getProducts();
          this.saved.emit(purchase);
        },
        error: (err) => this.toasters.error('Could not save purchase: ' + err.message),
      });
  }

  cancel(): void {
    this.resetForm();
    this.cancelled.emit();
  }

  resetForm(): void {
    this.form.reset({ date: startOfToday(), supplierName: '', note: '' });
    this.lineForm.reset();
    this.lines.set([]);
  }

  private findProduct(id: string | null): IProduct | undefined {
    return this.products().find((p) => p.id === id);
  }

  private dateWithCurrentTime(day: Date): Date {
    const now = new Date();
    return new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    );
  }
}
