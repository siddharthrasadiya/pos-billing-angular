import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  COSTING_METHOD_OPTIONS,
  CostingMethod,
  DEFAULT_COSTING_METHOD,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MIN_HISTORY_LIMIT,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';

const limitValidators = [
  Validators.required,
  Validators.min(MIN_HISTORY_LIMIT),
  Validators.max(MAX_HISTORY_LIMIT),
];

@Component({
  selector: 'app-stock-settings',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './stock-settings.component.html',
  styleUrl: './stock-settings.component.scss',
})
export class StockSettingsComponent implements OnInit {
  readonly costingOptions = COSTING_METHOD_OPTIONS;
  readonly defaultCostingName =
    COSTING_METHOD_OPTIONS.find((o) => o.id === DEFAULT_COSTING_METHOD)?.name ?? '';
  readonly minLimit = MIN_HISTORY_LIMIT;
  readonly maxLimit = MAX_HISTORY_LIMIT;

  readonly form = new FormGroup({
    costingMethod: new FormControl<CostingMethod | ''>('', { nonNullable: true }),
    priceHistoryLimit: new FormControl<number | null>(DEFAULT_HISTORY_LIMIT, limitValidators),
    movementHistoryLimit: new FormControl<number | null>(DEFAULT_HISTORY_LIMIT, limitValidators),
  });

  constructor(
    private settingsService: SettingsService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.settingsService.getShopSettings().subscribe((shop) =>
      this.form.reset({
        costingMethod: shop.costingMethod,
        priceHistoryLimit: shop.priceHistoryLimit,
        movementHistoryLimit: shop.movementHistoryLimit,
      }),
    );
  }

  // At most one method is on; tapping the selected one again turns it off (app default)
  toggleCosting(method: CostingMethod): void {
    const control = this.form.controls.costingMethod;
    control.setValue(control.value === method ? '' : method);
    control.markAsDirty();
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.toasters.warn(`History limits must be between ${MIN_HISTORY_LIMIT} and ${MAX_HISTORY_LIMIT}`);
      return;
    }
    const value = this.form.getRawValue();
    this.settingsService
      .saveShopSettings({
        costingMethod: value.costingMethod,
        priceHistoryLimit: value.priceHistoryLimit ?? DEFAULT_HISTORY_LIMIT,
        movementHistoryLimit: value.movementHistoryLimit ?? DEFAULT_HISTORY_LIMIT,
      })
      .subscribe({
        next: () => this.toasters.success('Stock settings saved'),
        error: (err) => this.toasters.error('Could not save: ' + err.message),
      });
  }
}
