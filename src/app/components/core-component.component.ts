import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { PrinterService, ToastersService } from 'src/app/core.index';
import { ReceiptPreviewComponent } from 'src/app/core/shared/receipt-preview/receipt-preview.component';

@Component({
  selector: 'app-core-component',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, ReceiptPreviewComponent],
  templateUrl: './core-component.component.html',
  styleUrl: './core-component.component.scss',
})
export class CoreComponentComponent {
  readonly tabs = [
    { path: 'billing', label: 'Bill', title: 'New Bill' },
    { path: 'products', label: 'Products', title: 'Products' },
    { path: 'customers', label: 'Customers', title: 'Customers' },
    { path: 'history', label: 'History', title: 'Sales History' },
    { path: 'settings', label: 'Settings', title: 'Settings' },
  ];
  readonly printerLabel = computed(() => {
    const name = this.printer.deviceName();
    return name ? 'Printer: ' + name : 'Printer: Connect';
  });
  readonly pageTitle: Signal<string>;

  constructor(
    protected printer: PrinterService,
    protected toasters: ToastersService,
    router: Router,
  ) {
    const url = toSignal(
      router.events.pipe(
        filter((e) => e instanceof NavigationEnd),
        map((e) => e.urlAfterRedirects),
      ),
      { initialValue: router.url },
    );
    this.pageTitle = computed(
      () => this.tabs.find((t) => url().startsWith('/' + t.path))?.title ?? 'POS Billing',
    );

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
