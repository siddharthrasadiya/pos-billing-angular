import { Component, computed, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  DEFAULT_PURCHASE_RETENTION_DAYS,
  MAX_PURCHASE_RETENTION_DAYS,
  MIN_PURCHASE_RETENTION_DAYS,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { deleteWarningDays } from '../../purchase-management/purchase-management.service';

@Component({
  selector: 'app-purchase-settings',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './purchase-settings.component.html',
})
export class PurchaseSettingsComponent implements OnInit {
  readonly minDays = MIN_PURCHASE_RETENTION_DAYS;
  readonly maxDays = MAX_PURCHASE_RETENTION_DAYS;
  readonly retentionDays = new FormControl<number | null>(DEFAULT_PURCHASE_RETENTION_DAYS, [
    Validators.required,
    Validators.min(MIN_PURCHASE_RETENTION_DAYS),
    Validators.max(MAX_PURCHASE_RETENTION_DAYS),
  ]);
  private readonly days = toSignal(this.retentionDays.valueChanges, {
    initialValue: DEFAULT_PURCHASE_RETENTION_DAYS,
  });
  readonly warningDays = computed(() => deleteWarningDays(this.days() ?? DEFAULT_PURCHASE_RETENTION_DAYS));

  constructor(
    private settingsService: SettingsService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.settingsService
      .getShopSettings()
      .subscribe((shop) => this.retentionDays.setValue(shop.purchaseRetentionDays));
  }

  save(): void {
    this.retentionDays.markAsTouched();
    if (this.retentionDays.invalid || this.retentionDays.value === null) {
      this.toasters.warn(`Days must be between ${MIN_PURCHASE_RETENTION_DAYS} and ${MAX_PURCHASE_RETENTION_DAYS}`);
      return;
    }
    this.settingsService.saveShopSettings({ purchaseRetentionDays: this.retentionDays.value }).subscribe({
      next: () => this.toasters.success('Purchase settings saved'),
      error: (err) => this.toasters.error('Could not save: ' + err.message),
    });
  }
}
