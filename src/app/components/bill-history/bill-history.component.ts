import { Component, computed, OnInit, signal } from '@angular/core';
import {
  buildReceipt,
  dayKey,
  formatDate,
  IS_LOCAL,
  IShopSettings,
  money,
  PrinterService,
  ReceiptPreviewService,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { IBillWithItems } from '../billing/billing.interface';
import { BillHistoryService } from './bill-history.service';

@Component({
  selector: 'app-bill-history',
  templateUrl: './bill-history.component.html',
  styleUrl: './bill-history.component.scss',
})
export class BillHistoryComponent implements OnInit {
  readonly isLocal = IS_LOCAL;
  readonly money = money;
  readonly day = signal(dayKey(new Date()));
  readonly bills = signal<IBillWithItems[]>([]);
  readonly sales = computed(() => this.bills().reduce((sum, b) => sum + b.total, 0));
  readonly profit = computed(() => this.bills().reduce((sum, b) => sum + this.billProfit(b), 0));
  readonly margin = computed(() =>
    this.sales() > 0 ? ((this.profit() / this.sales()) * 100).toFixed(1) + '%' : '-',
  );
  private shop?: IShopSettings;

  constructor(
    private billHistoryService: BillHistoryService,
    private settingsService: SettingsService,
    private printer: PrinterService,
    private preview: ReceiptPreviewService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getTableData();
    this.settingsService.getShopSettings().subscribe((shop) => (this.shop = shop));
  }

  getTableData(): void {
    this.billHistoryService.getBillsByDay(this.day()).subscribe({
      next: (bills) => this.bills.set(bills),
      error: (err) => this.toasters.show('Could not load bills: ' + err.message),
    });
  }

  setDay(value: string): void {
    this.day.set(value || dayKey(new Date()));
    this.getTableData();
  }

  shiftDay(days: number): void {
    const date = new Date(this.day() + 'T00:00');
    date.setDate(date.getDate() + days);
    this.setDay(dayKey(date));
  }

  billProfit(bill: IBillWithItems): number {
    return bill.items.reduce((sum, i) => sum + i.qty * (i.rate - i.cost), 0);
  }

  billTime(bill: IBillWithItems): string {
    return formatDate(new Date(bill.date));
  }

  view(bill: IBillWithItems): void {
    if (this.shop) this.preview.show(buildReceipt(this.shop, bill));
  }

  reprint(bill: IBillWithItems): void {
    if (this.shop) this.printer.print(buildReceipt(this.shop, bill));
  }
}
