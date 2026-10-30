import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, signal, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
    { path: 'billing', label: 'Bill', title: 'New Bill', bottom: true },
    { path: 'products', label: 'Products', title: 'Products', bottom: false },
    { path: 'purchases', label: 'Purchase', title: 'Purchases', bottom: false },
    { path: 'customers', label: 'Customers', title: 'Customers', bottom: true },
    { path: 'history', label: 'History', title: 'Sales History', bottom: true },
    { path: 'settings', label: 'Settings', title: 'Settings', bottom: false },
  ];
  // Phone bottom bar keeps the daily pages; the rest sit under More
  readonly bottomTabs = this.tabs.filter((t) => t.bottom);
  readonly moreTabs = this.tabs.filter((t) => !t.bottom);
  readonly moreOpen = signal(false);
  readonly isMoreActive: Signal<boolean>;
  readonly printerLabel = computed(() => {
    const name = this.printer.deviceName();
    if (name) return 'Printer: ' + name;
    const saved = this.printer.defaultPrinter();
    return saved ? 'Connect ' + (saved.name || 'printer') : 'Printer: Connect';
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
    this.isMoreActive = computed(() => this.moreTabs.some((t) => url().startsWith('/' + t.path)));
    effect(() => {
      url();
      this.moreOpen.set(false);
    });

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
