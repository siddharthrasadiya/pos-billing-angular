import { Component, effect, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  formatMobile,
  ICategory,
  MOBILE_PATTERN,
  mobileDigits,
  ToastersService,
} from 'src/app/core.index';
import { ICustomer } from '../customer-management.interface';
import { CustomerManagementService } from '../customer-management.service';

const NEW_CATEGORY = '__new';

@Component({
  selector: 'app-customer-add-edit',
  imports: [ReactiveFormsModule],
  templateUrl: './customer-add-edit.component.html',
})
export class CustomerAddEditComponent {
  readonly customer = input<ICustomer | null>(null);
  readonly categories = input<ICategory[]>([]);
  readonly saved = output<ICustomer>();
  readonly cancelled = output<void>();
  readonly categoriesChanged = output<void>();
  readonly newCategory = NEW_CATEGORY;

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    mobile: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(MOBILE_PATTERN)],
    }),
    categoryId: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    gstin: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private customerManagementService: CustomerManagementService,
    private toasters: ToastersService,
  ) {
    effect(() => {
      const customer = this.customer();
      this.form.reset({
        name: customer?.name ?? '',
        mobile: formatMobile(customer?.mobile ?? ''),
        categoryId: customer?.categoryId ?? '',
        email: customer?.email ?? '',
        gstin: customer?.gstin ?? '',
        address: customer?.address ?? '',
      });
    });
  }

  onMobileInput(): void {
    const control = this.form.controls.mobile;
    control.setValue(formatMobile(control.value));
  }

  onCategoryChange(): void {
    const control = this.form.controls.categoryId;
    if (control.value !== NEW_CATEGORY) return;
    const name = prompt('New customer category name')?.trim();
    if (!name) {
      control.setValue('');
      return;
    }
    this.customerManagementService.saveCategory(name).subscribe({
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
    const value = this.form.getRawValue();
    const name = value.name.trim();
    if (!name) {
      this.form.markAllAsTouched();
      this.toasters.warn('Enter customer name');
      return;
    }
    if (this.form.controls.mobile.invalid) {
      this.form.controls.mobile.markAsTouched();
      this.toasters.warn('Enter 10 digit mobile number, like 12345-67890');
      return;
    }
    if (this.form.controls.email.invalid) {
      this.toasters.warn('Email looks wrong');
      return;
    }
    const existing = this.customer() ?? undefined;
    this.customerManagementService
      .saveCustomer(
        {
          name,
          mobile: mobileDigits(value.mobile),
          categoryId: value.categoryId === NEW_CATEGORY ? '' : value.categoryId,
          email: value.email.trim(),
          gstin: value.gstin.trim().toUpperCase(),
          address: value.address.trim(),
        },
        existing,
      )
      .subscribe({
        next: (customer) => {
          this.toasters.success(existing ? 'Customer updated' : 'Customer added');
          this.form.reset();
          this.saved.emit(customer);
        },
        error: (err) => this.toasters.error('Could not save: ' + err.message),
      });
  }

  cancel(): void {
    this.form.reset();
    this.cancelled.emit();
  }
}
