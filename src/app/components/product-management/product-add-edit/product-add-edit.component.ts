import { Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { money, ToastersService } from 'src/app/core.index';
import { ICategory, IProduct } from '../product-management.interface';
import { ProductManagementService } from '../product-management.service';

const NEW_CATEGORY = '__new';

@Component({
  selector: 'app-product-add-edit',
  imports: [ReactiveFormsModule],
  templateUrl: './product-add-edit.component.html',
})
export class ProductAddEditComponent {
  readonly product = input<IProduct | null>(null);
  readonly categories = input<ICategory[]>([]);
  readonly saved = output<IProduct>();
  readonly cancelled = output<void>();
  readonly categoriesChanged = output<void>();
  readonly newCategory = NEW_CATEGORY;

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    shortName: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl('', { nonNullable: true }),
    buyPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    sellPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    stock: new FormControl<number | null>(null, [Validators.required]),
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
  ) {
    effect(() => {
      const product = this.product();
      this.form.reset({
        name: product?.name ?? '',
        shortName: product?.shortName ?? '',
        categoryId: product?.categoryId ?? '',
        buyPrice: product?.buyPrice ?? null,
        sellPrice: product?.sellPrice ?? null,
        stock: product?.stock ?? null,
      });
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
        this.toasters.show('Could not add category: ' + err.message);
      },
    });
  }

  save(): void {
    const value = this.form.getRawValue();
    const name = value.name.trim();
    if (this.form.invalid || !name) {
      this.form.markAllAsTouched();
      this.toasters.show('Fill name, buy price, sell price and stock');
      return;
    }
    const existing = this.product() ?? undefined;
    this.productManagementService
      .saveProduct(
        {
          name,
          shortName: value.shortName.trim(),
          categoryId: value.categoryId === NEW_CATEGORY ? '' : value.categoryId,
          buyPrice: Number(value.buyPrice),
          sellPrice: Number(value.sellPrice),
          stock: Number(value.stock),
        },
        existing,
      )
      .subscribe({
        next: (product) => {
          this.toasters.show(existing ? 'Product updated' : 'Product added');
          this.form.reset();
          this.saved.emit(product);
        },
        error: (err) => this.toasters.show('Could not save: ' + err.message),
      });
  }

  cancel(): void {
    this.form.reset();
    this.cancelled.emit();
  }
}
