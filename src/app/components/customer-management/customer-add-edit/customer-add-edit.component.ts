import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BILL_LANGUAGE_OPTIONS,
  BillLanguage,
  formatMobile,
  ICategory,
  MOBILE_PATTERN,
  mobileDigits,
  ToastersService,
  WALK_IN_CUSTOMER_ID,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { ICustomer, ICustomerContact, MAX_CONTACTS } from '../customer-management.interface';
import { CustomerManagementService } from '../customer-management.service';

const NEW_CATEGORY = '__new';

type ContactForm = FormGroup<{ name: FormControl<string>; mobile: FormControl<string> }>;

function contactForm(contact?: ICustomerContact): ContactForm {
  return new FormGroup({
    name: new FormControl(contact?.name ?? '', { nonNullable: true }),
    mobile: new FormControl(formatMobile(contact?.mobile ?? ''), {
      nonNullable: true,
      validators: [Validators.pattern(MOBILE_PATTERN)],
    }),
  });
}

@Component({
  selector: 'app-customer-add-edit',
  imports: [ReactiveFormsModule, CustomElementModule, IconComponent],
  templateUrl: './customer-add-edit.component.html',
  styleUrl: './customer-add-edit.component.scss',
})
export class CustomerAddEditComponent {
  @Input() set customer(value: ICustomer | null) {
    this.editing = value;
    this.resetForm(value);
  }
  @Input() set categories(value: ICategory[]) {
    this.categoryOptions = [...value, { id: NEW_CATEGORY, name: '+ New category...' }];
  }
  @Output() saved: EventEmitter<ICustomer> = new EventEmitter();
  @Output() cancelled: EventEmitter<void> = new EventEmitter();
  @Output() categoriesChanged: EventEmitter<void> = new EventEmitter();

  readonly languageOptions = BILL_LANGUAGE_OPTIONS;
  readonly maxContacts = MAX_CONTACTS;
  editing: ICustomer | null = null;
  categoryOptions: { id: string; name: string }[] = [];

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    // First contact is the main number, shown on bills and in lists
    contacts: new FormArray<ContactForm>([contactForm()]),
    categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    billLanguage: new FormControl(BillLanguage.English, { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    gstin: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private customerManagementService: CustomerManagementService,
    private toasters: ToastersService,
  ) {}

  get contacts(): FormArray<ContactForm> {
    return this.form.controls.contacts;
  }

  resetForm(customer: ICustomer | null = null): void {
    const saved = customer?.contacts?.length
      ? customer.contacts
      : customer?.mobile
        ? [{ name: '', mobile: customer.mobile }]
        : [];
    this.contacts.clear();
    (saved.length ? saved : [undefined]).forEach((c) => this.contacts.push(contactForm(c)));
    this.form.reset({
      name: customer?.name ?? '',
      categoryId: customer?.categoryId ?? '',
      billLanguage: customer?.billLanguage ?? BillLanguage.English,
      email: customer?.email ?? '',
      gstin: customer?.gstin ?? '',
      address: customer?.address ?? '',
    });
  }

  addContact(): void {
    if (this.contacts.length < MAX_CONTACTS) this.contacts.push(contactForm());
  }

  removeContact(index: number): void {
    if (this.contacts.length > 1) this.contacts.removeAt(index);
    else this.contacts.at(0).reset({ name: '', mobile: '' });
  }

  // The main number moves to the top; it is the one printed on bills
  makeMain(index: number): void {
    const contact = this.contacts.at(index);
    this.contacts.removeAt(index);
    this.contacts.insert(0, contact);
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
    // Walk-in is the one built-in customer and stays without a category
    const isWalkIn = this.editing?.id === WALK_IN_CUSTOMER_ID;
    if (!isWalkIn && (!value.categoryId || value.categoryId === NEW_CATEGORY)) {
      this.toasters.warn('Pick a category');
      return;
    }
    if (this.contacts.controls.some((c) => c.controls.mobile.invalid)) {
      this.toasters.warn('Enter 10 digit mobile numbers, like 12345-67890');
      return;
    }
    const contacts = value.contacts
      .map((c) => ({ name: c.name.trim(), mobile: mobileDigits(c.mobile) }))
      .filter((c) => c.mobile);
    if (new Set(contacts.map((c) => c.mobile)).size !== contacts.length) {
      this.toasters.warn('The same number is entered twice');
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
          contacts,
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
