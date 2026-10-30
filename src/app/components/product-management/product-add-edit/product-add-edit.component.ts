import { Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, filter, map, of, switchMap, tap } from 'rxjs';
import {
  ICategory,
  MAX_PRICE,
  MAX_QTY,
  money,
  ToastersService,
  TranslateService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { IProduct } from '../product-management.interface';
import { ProductManagementService } from '../product-management.service';

const NEW_CATEGORY = '__new';

@Component({
  selector: 'app-product-add-edit',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './product-add-edit.component.html',
})
export class ProductAddEditComponent {
  readonly maxPrice = MAX_PRICE;
  readonly maxQty = MAX_QTY;
  @Input() set product(value: IProduct | null) {
    this.editing = value;
    this.resetForm(value);
  }
  @Input() set categories(value: ICategory[]) {
    this.categoryOptions = [
      { id: '', name: 'No category' },
      ...value,
      { id: NEW_CATEGORY, name: '+ New category...' },
    ];
  }
  @Output() saved: EventEmitter<IProduct> = new EventEmitter();
  @Output() cancelled: EventEmitter<void> = new EventEmitter();
  @Output() categoriesChanged: EventEmitter<void> = new EventEmitter();

  readonly money = money;
  editing: IProduct | null = null;
  // Once the user types their own Gujarati name, auto-translation stops overwriting it
  isLocalNameManual = false;
  readonly isTranslating = signal(false);
  readonly isAutoTranslated = signal(false);
  categoryOptions: { id: string; name: string }[] = [];

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    localName: new FormControl('', { nonNullable: true }),
    shortName: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl('', { nonNullable: true }),
    buyPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    sellPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    stock: new FormControl<number | null>(0, [Validators.min(0)]),
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly margin = computed(() => {
    const { buyPrice, sellPrice } = this.formValue();
    if (buyPrice == null || sellPrice == null) return null;
    const profit = sellPrice - buyPrice;
    if (profit < 0) return { loss: true, text: `Loss per unit: ${money(-profit)}` };
    const percent = sellPrice > 0 ? ` (${((profit / sellPrice) * 100).toFixed(1)}% margin)` : '';
    return { loss: false, text: `Profit per unit: ${money(profit)}${percent}` };
  });

  constructor(
    private productManagementService: ProductManagementService,
    private toasters: ToastersService,
    private translateService: TranslateService,
  ) {
    this.form.controls.name.valueChanges
      .pipe(
        debounceTime(600),
        map((name) => name.trim()),
        distinctUntilChanged(),
        filter(() => !this.isLocalNameManual),
        tap((name) => this.isTranslating.set(!!name)),
        switchMap((name) => (name ? this.translateService.toGujarati(name) : of(''))),
        takeUntilDestroyed(),
      )
      .subscribe((gujarati) => {
        this.isTranslating.set(false);
        if (this.isLocalNameManual) return;
        this.form.controls.localName.setValue(gujarati);
        this.isAutoTranslated.set(!!gujarati);
      });
  }

  onLocalNameInput(value: string): void {
    this.isLocalNameManual = !!value?.trim();
    this.isAutoTranslated.set(false);
  }

  resetForm(product: IProduct | null = null): void {
    this.isLocalNameManual = !!product?.localName;
    this.isAutoTranslated.set(false);
    this.form.reset({
      name: product?.name ?? '',
      localName: product?.localName ?? '',
      shortName: product?.shortName ?? '',
      categoryId: product?.categoryId ?? '',
      buyPrice: product?.buyPrice ?? null,
      sellPrice: product?.sellPrice ?? null,
      stock: product?.stock ?? 0,
    });
  }

  onCategoryChange(): void {
    const control = this.form.controls.categoryId;
    if (control.value !== NEW_CATEGORY) return;
    const name = prompt('New category name')?.trim();
    if (!name) {
      control.setValue('');
      return;
    }
    this.productManagementService.saveCategory(name).subscribe({
      next: (category) => {
        this.categoriesChanged.emit();
        // Wait for the new option to render before selecting it
        setTimeout(() => control.setValue(category.id));
      },
      error: (err) => {
        control.setValue('');
        this.toasters.error('Could not add category: ' + err.message);
      },
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || !value.name.trim()) {
      this.toasters.warn('Fill name, buying price and sell price');
      return;
    }
    const existing = this.editing ?? undefined;
    this.productManagementService
      .saveProduct(
        {
          name: value.name.trim(),
          localName: value.localName.trim(),
          shortName: value.shortName.trim(),
          categoryId: value.categoryId === NEW_CATEGORY ? '' : value.categoryId,
          buyPrice: Number(value.buyPrice),
          sellPrice: Number(value.sellPrice),
          stock: Number(value.stock ?? 0),
        },
        existing,
      )
      .subscribe({
        next: (product) => {
          this.toasters.success(existing ? 'Product updated' : 'Product added');
          this.resetForm();
          this.saved.emit(product);
        },
        error: (err) => this.toasters.error('Could not save: ' + err.message),
      });
  }

  cancel(): void {
    this.resetForm();
    this.cancelled.emit();
  }
}
