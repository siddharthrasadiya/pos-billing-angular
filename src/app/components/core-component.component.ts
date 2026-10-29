import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PrinterService, ToastersService } from 'src/app/core.index';
import { ReceiptPreviewComponent } from 'src/app/core/shared/receipt-preview/receipt-preview.component';

@Component({
  selector: 'app-core-component',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReceiptPreviewComponent],
  templateUrl: './core-component.component.html',
  styleUrl: './core-component.component.scss',
})
export class CoreComponentComponent {
  readonly tabs = [
    { path: 'billing', label: 'Bill' },
    { path: 'products', label: 'Products' },
    { path: 'history', label: 'History' },
    { path: 'settings', label: 'Settings' },
  ];
  readonly printerLabel = computed(() => {
    const name = this.printer.deviceName();
    return name ? 'Printer: ' + name : 'Printer: Connect';
  });

  constructor(
    protected printer: PrinterService,
    protected toasters: ToastersService,
  ) {
    if (!printer.supported) {
      toasters.show('Web Bluetooth not supported. Use Chrome on Android or PC.');
    }
  }

  async togglePrinter(): Promise<void> {
    if (this.printer.deviceName()) {
      if (confirm('Disconnect printer?')) this.printer.disconnect();
      return;
    }
    try {
      await this.printer.connect();
      this.toasters.show('Printer connected');
    } catch (err) {
      this.toasters.show((err as Error).message);
    }
  }
}
