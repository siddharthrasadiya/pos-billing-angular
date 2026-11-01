import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  DEFAULT_CUSTOMER_BILL_LIMIT,
  DEFAULT_STATEMENT_LIMIT,
  MAX_CUSTOMER_LIMIT,
  MIN_CUSTOMER_LIMIT,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';

const limitValidators = [
  Validators.required,
  Validators.min(MIN_CUSTOMER_LIMIT),
  Validators.max(MAX_CUSTOMER_LIMIT),
];

@Component({
  selector: 'app-customer-settings',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './customer-settings.component.html',
})
export class CustomerSettingsComponent implements OnInit {
  readonly minLimit = MIN_CUSTOMER_LIMIT;
  readonly maxLimit = MAX_CUSTOMER_LIMIT;

  readonly form = new FormGroup({
    statementLimit: new FormControl<number | null>(DEFAULT_STATEMENT_LIMIT, limitValidators),
    customerBillLimit: new FormControl<number | null>(DEFAULT_CUSTOMER_BILL_LIMIT, limitValidators),
  });

  constructor(
    private settingsService: SettingsService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.settingsService.getShopSettings().subscribe((shop) =>
      this.form.reset({
        statementLimit: shop.statementLimit,
        customerBillLimit: shop.customerBillLimit,
      }),
    );
  }

  // A lower number deletes the older entries and bills right away
  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.toasters.warn(`Limits must be between ${MIN_CUSTOMER_LIMIT} and ${MAX_CUSTOMER_LIMIT}`);
      return;
    }
    const value = this.form.getRawValue();
    this.settingsService
      .saveShopSettings({
        statementLimit: value.statementLimit ?? DEFAULT_STATEMENT_LIMIT,
        customerBillLimit: value.customerBillLimit ?? DEFAULT_CUSTOMER_BILL_LIMIT,
      })
      .subscribe({
        next: () => this.toasters.success('Customer settings saved'),
        error: (err) => this.toasters.error('Could not save: ' + err.message),
      });
  }
}
