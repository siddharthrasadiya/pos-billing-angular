import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingsService, ToastersService } from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';

@Component({
  selector: 'app-shop-settings',
  imports: [ReactiveFormsModule, CustomElementModule],
  templateUrl: './shop-settings.component.html',
})
export class ShopSettingsComponent implements OnInit {
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    gst: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private settingsService: SettingsService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.settingsService.getShopSettings().subscribe((shop) =>
      this.form.reset({ name: shop.name, address: shop.address, gst: shop.gst }),
    );
  }

  save(): void {
    const value = this.form.getRawValue();
    if (!value.name.trim()) {
      this.form.markAllAsTouched();
      this.toasters.warn('Enter shop name');
      return;
    }
    this.settingsService
      .saveShopSettings({
        name: value.name.trim(),
        address: value.address.trim(),
        gst: value.gst.trim(),
      })
      .subscribe({
        next: () => this.toasters.success('Shop details saved'),
        error: (err) => this.toasters.error('Could not save: ' + err.message),
      });
  }
}
