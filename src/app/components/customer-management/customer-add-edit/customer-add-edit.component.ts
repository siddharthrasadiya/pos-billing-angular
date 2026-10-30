import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BILL_LANGUAGE_OPTIONS,
  BillLanguage,
  formatMobile,
  ICategory,
  MOBILE_PATTERN,
  mobileDigits,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { ICustomer } from '../customer-management.interface';
import { CustomerManagementService } from '../customer-management.service';

const NEW_CATEGORY = '__new';

@Component({
  selector: 'app-customer-add-edit',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './customer-add-edit.component.html',
})
export class CustomerAddEditComponent {
  @Input() set customer(value: ICustomer | null) {
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
  @Output() saved: EventEmitter<ICustomer> = new EventEmitter();
  @Output() cancelled: EventEmitter<void> = new EventEmitter();
  @Output() categoriesChanged: EventEmitter<void> = new EventEmitter();

  readonly languageOptions = BILL_LANGUAGE_OPTIONS;
  editing: ICustomer | null = null;
  categoryOptions: { id: string; name: string }[] = [];

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    mobile: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(MOBILE_PATTERN)],
    }),
    categoryId: new FormControl('', { nonNullable: true }),
    billLanguage: new FormControl(BillLanguage.English, { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    gstin: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private customerManagementService: CustomerManagementService,
    private toasters: ToastersService,
  ) {}

  resetForm(customer: ICustomer | null = null): void {
    this.form.reset({
      name: customer?.name ?? '',
      mobile: formatMobile(customer?.mobile ?? ''),
      categoryId: customer?.categoryId ?? '',
      billLanguage: customer?.billLanguage ?? BillLanguage.English,
      email: customer?.email ?? '',
      gstin: customer?.gstin ?? '',
      address: customer?.address ?? '',
    });
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
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (!value.name.trim()) {
      this.toasters.warn('Enter customer name');
      return;
    }
    if (this.form.controls.mobile.invalid) {
      this.toasters.warn('Enter 10 digit mobile number, like 12345-67890');
      return;
    }
    if (this.form.controls.email.invalid) {
      this.toasters.warn('Email looks wrong');
      return;
    }
    const existing = this.editing ?? undefined;
    this.customerManagementService
      .saveCustomer(
        {
          name: value.name.trim(),
          mobile: mobileDigits(value.mobile),
          categoryId: value.categoryId === NEW_CATEGORY ? '' : value.categoryId,
          billLanguage: value.billLanguage,
          email: value.email.trim(),
          gstin: value.gstin.trim().toUpperCase(),
          address: value.address.trim(),
        },
        existing,
      )
      .subscribe({
        next: (customer) => {
          this.toasters.success(existing ? 'Customer updated' : 'Customer added');
          this.resetForm();
          this.saved.emit(customer);
        },
        error: (err) => this.toasters.error('Could not save: ' + err.message),
      });
  }

  cancel(): void {
    this.resetForm();
    this.cancelled.emit();
  }
}
