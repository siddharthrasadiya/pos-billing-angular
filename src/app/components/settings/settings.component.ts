import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  buildTestReceipt,
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
})
export class SettingsComponent implements OnInit {
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    gst: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private settingsService: SettingsService,
    private printer: PrinterService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.settingsService.getShopSettings().subscribe((shop) => this.form.reset(shop));
  }

  save(): void {
    const shop = this.trimmedValue();
    if (!shop.name) {
      this.toasters.warn('Enter shop name');
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
    return { name: value.name.trim(), address: value.address.trim(), gst: value.gst.trim() };
  }
}
