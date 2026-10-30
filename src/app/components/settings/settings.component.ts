import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  buildTestReceipt,
  COSTING_METHOD_OPTIONS,
  CostingMethod,
  DEFAULT_COSTING_METHOD,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  IShopSettings,
  PrinterService,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  readonly costingOptions = COSTING_METHOD_OPTIONS;
  readonly defaultCostingName =
    COSTING_METHOD_OPTIONS.find((o) => o.id === DEFAULT_COSTING_METHOD)?.name ?? '';

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    gst: new FormControl('', { nonNullable: true }),
    costingMethod: new FormControl<CostingMethod | ''>('', { nonNullable: true }),
    priceHistoryLimit: new FormControl<number | null>(DEFAULT_HISTORY_LIMIT, [
      Validators.required,
      Validators.min(1),
      Validators.max(MAX_HISTORY_LIMIT),
    ]),
    movementHistoryLimit: new FormControl<number | null>(DEFAULT_HISTORY_LIMIT, [
      Validators.required,
      Validators.min(1),
      Validators.max(MAX_HISTORY_LIMIT),
    ]),
  });

  constructor(
    private settingsService: SettingsService,
    private printer: PrinterService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.settingsService.getShopSettings().subscribe((shop) => this.form.reset(shop));
  }

  // At most one method is on; tapping the selected one again turns it off (app default)
  toggleCosting(method: CostingMethod): void {
    const control = this.form.controls.costingMethod;
    control.setValue(control.value === method ? '' : method);
    control.markAsDirty();
  }

  save(): void {
    const shop = this.trimmedValue();
    if (!shop.name) {
      this.toasters.warn('Enter shop name');
      return;
    }
    if (this.form.controls.priceHistoryLimit.invalid || this.form.controls.movementHistoryLimit.invalid) {
      this.form.markAllAsTouched();
      this.toasters.warn(`History limits must be between 1 and ${MAX_HISTORY_LIMIT}`);
      return;
    }
    this.settingsService.saveShopSettings(shop).subscribe({
      next: () => this.toasters.success('Settings saved'),
      error: (err) => this.toasters.error('Could not save: ' + err.message),
    });
  }

  testPrint(): void {
    this.printer.print(buildTestReceipt(this.trimmedValue()));
  }

  private trimmedValue(): IShopSettings {
    const value = this.form.getRawValue();
    return {
      name: value.name.trim(),
      address: value.address.trim(),
      gst: value.gst.trim(),
      costingMethod: value.costingMethod,
      priceHistoryLimit: value.priceHistoryLimit ?? DEFAULT_HISTORY_LIMIT,
      movementHistoryLimit: value.movementHistoryLimit ?? DEFAULT_HISTORY_LIMIT,
    };
  }
}
