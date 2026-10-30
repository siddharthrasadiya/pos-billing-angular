import { Component, OnInit } from '@angular/core';
import {
  buildTestReceipt,
  IShopSettings,
  PrinterService,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';

@Component({
  selector: 'app-printer-settings',
  templateUrl: './printer-settings.component.html',
  styleUrl: './printer-settings.component.scss',
})
export class PrinterSettingsComponent implements OnInit {
  private shop?: IShopSettings;

  constructor(
    protected printer: PrinterService,
    private settingsService: SettingsService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.settingsService.getShopSettings().subscribe((shop) => (this.shop = shop));
  }

  async selectPrinter(): Promise<void> {
    try {
      await this.printer.selectPrinter();
      this.toasters.success(`${this.printer.defaultPrinter()?.name || 'Printer'} is now the default printer`);
    } catch (err) {
      this.toasters.error((err as Error).message);
    }
  }

  async reconnect(): Promise<void> {
    try {
      if (!(await this.printer.reconnectDefault())) await this.printer.connect();
      this.toasters.success('Printer connected');
    } catch (err) {
      this.toasters.error('Could not connect: ' + (err as Error).message);
    }
  }

  testPrint(): void {
    if (this.shop) this.printer.print(buildTestReceipt(this.shop));
  }

  async forget(): Promise<void> {
    if (!confirm('Remove the default printer from this device?')) return;
    await this.printer.forgetDefault();
    this.toasters.success('Printer removed');
  }
}
