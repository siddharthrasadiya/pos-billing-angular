import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
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
})
export class StockSettingsComponent implements OnInit {
  readonly minLimit = MIN_HISTORY_LIMIT;
  readonly maxLimit = MAX_HISTORY_LIMIT;

  readonly form = new FormGroup({
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
        priceHistoryLimit: shop.priceHistoryLimit,
        movementHistoryLimit: shop.movementHistoryLimit,
      }),
    );
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.toasters.warn(
        `History limits must be between ${MIN_HISTORY_LIMIT} and ${MAX_HISTORY_LIMIT}`,
      );
      return;
    }
    const value = this.form.getRawValue();
    this.settingsService
      .saveShopSettings({
        priceHistoryLimit: value.priceHistoryLimit ?? DEFAULT_HISTORY_LIMIT,
        movementHistoryLimit: value.movementHistoryLimit ?? DEFAULT_HISTORY_LIMIT,
      })
      .subscribe({
        next: () => this.toasters.success('Stock settings saved'),
        error: (err) => this.toasters.error('Could not save: ' + err.message),
      });
  }
}
