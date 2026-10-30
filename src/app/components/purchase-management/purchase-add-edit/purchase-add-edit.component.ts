import { Component, computed, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { switchMap } from 'rxjs';
import { MAX_PRICE, MAX_QTY, money, roundMoney, ToastersService } from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { IProduct } from '../../product-management/product-management.interface';
import { ProductManagementService } from '../../product-management/product-management.service';
import { IPurchase, IPurchaseLine, IPurchaseWithItems } from '../purchase-management.interface';
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
  readonly maxPrice = MAX_PRICE;
  readonly maxQty = MAX_QTY;
  // An order that is not received yet can be opened here again and changed
  @Input() set purchase(value: IPurchaseWithItems | null) {
    this.editing = value;
    this.resetForm(value);
  }
  @Output() saved: EventEmitter<IPurchase> = new EventEmitter();
  @Output() cancelled: EventEmitter<void> = new EventEmitter();

  readonly money = money;
  readonly today = new Date();
  editing: IPurchaseWithItems | null = null;
  readonly products = signal<IProduct[]>([]);
  readonly lines = signal<IPurchaseLine[]>([]);
  readonly editingLine = signal<number | null>(null);
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

  // Picking a product pre-fills its last buying price and current selling price
  onProductChange(): void {
    const product = this.findProduct(this.lineForm.controls.productId.value);
    this.lineForm.patchValue({
      unitCost: product?.buyPrice ?? null,
      sellPrice: product?.sellPrice ?? null,
    });
  }

  saveLine(): void {
    const { productId, qty, unitCost, sellPrice } = this.lineForm.getRawValue();
    const product = this.findProduct(productId);
    if (!product || !qty || qty <= 0 || unitCost === null || unitCost < 0) {
      this.toasters.warn('Pick a product and enter quantity and buying price');
      return;
    }
    const line: IPurchaseLine = {
      productId: product.id,
      name: product.name,
      qty,
      unitCost: roundMoney(unitCost),
      sellPrice:
        sellPrice === null || sellPrice === product.sellPrice ? null : roundMoney(sellPrice),
    };
    const index = this.editingLine();
    this.lines.update((lines) =>
      index === null ? [...lines, line] : lines.map((l, i) => (i === index ? line : l)),
    );
    this.cancelLineEdit();
  }

  editLine(index: number): void {
    const line = this.lines()[index];
    const product = this.findProduct(line.productId);
    this.editingLine.set(index);
    this.lineForm.setValue({
      productId: line.productId,
      qty: line.qty,
      unitCost: line.unitCost,
      sellPrice: line.sellPrice ?? product?.sellPrice ?? null,
    });
  }

  cancelLineEdit(): void {
    this.editingLine.set(null);
    this.lineForm.reset();
  }

  removeLine(index: number): void {
    if (this.editingLine() === index) this.cancelLineEdit();
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  // receiveNow = goods are already in hand, so the order is received in full straight away
  save(receiveNow: boolean): void {
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
    const save$ = this.purchaseManagementService.savePurchase(
      {
        date: customDatetime(this.dateWithCurrentTime(value.date), { get: 'UTC' }),
        supplierName: value.supplierName.trim(),
        note: value.note.trim(),
        items: this.lines(),
      },
      this.editing?.id,
    );
    const result$ = receiveNow
      ? save$.pipe(switchMap((p) => this.purchaseManagementService.receivePurchase(p.id, {})))
      : save$;
    result$.subscribe({
      next: (purchase) => {
        this.toasters.success(
          receiveNow
            ? 'Purchase received, stock added'
            : this.editing
              ? 'Order updated'
              : 'Order saved',
        );
        this.resetForm();
        this.getProducts();
        this.saved.emit(purchase);
      },
      error: (err) => this.toasters.error('Could not save purchase: ' + err.message),
    });
  }

  cancel(): void {
    this.resetForm(this.editing);
    this.cancelled.emit();
  }

  resetForm(purchase: IPurchaseWithItems | null = null): void {
    this.form.reset({
      date: purchase ? new Date(purchase.date) : startOfToday(),
      supplierName: purchase?.supplierName ?? '',
      note: purchase?.note ?? '',
    });
    this.cancelLineEdit();
    this.lines.set(
      (purchase?.items ?? []).map(({ productId, name, qty, unitCost, sellPrice }) => ({
        productId,
        name,
        qty,
        unitCost,
        sellPrice,
      })),
    );
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
