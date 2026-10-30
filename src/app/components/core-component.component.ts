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
import { ToasterComponent } from 'src/app/core/shared/toaster/toaster.component';

@Component({
  selector: 'app-core-component',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    ReceiptPreviewComponent,
    ToasterComponent,
  ],
  templateUrl: './core-component.component.html',
  styleUrl: './core-component.component.scss',
})
export class CoreComponentComponent {
  readonly tabs = [
    { path: 'billing', label: 'Bill', title: 'New Bill' },
    { path: 'products', label: 'Products', title: 'Products' },
    { path: 'purchases', label: 'Purchase', title: 'Purchases' },
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
    private toasters: ToastersService,
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
      toasters.warn('Web Bluetooth not supported. Use Chrome on Android or PC.');
    }
  }

  async togglePrinter(): Promise<void> {
    if (this.printer.deviceName()) {
      if (confirm('Disconnect printer?')) this.printer.disconnect();
      return;
    }
    try {
      if (!(await this.printer.reconnectDefault())) await this.printer.connect();
      this.toasters.success('Printer connected');
    } catch (err) {
      this.toasters.error((err as Error).message);
    }
  }
}
