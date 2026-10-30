import { Component, computed, OnInit, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  BILL_STATUS_LABELS,
  BillStatus,
  IShopSettings,
  mobileDigits,
  money,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { IBill } from '../billing/billing.interface';
import { BillDetailComponent } from './bill-detail/bill-detail.component';
import { BillHistoryService } from './bill-history.service';

const ALL = 'all';

interface IDayGroup {
  day: string;
  label: string;
  total: number;
  bills: IBill[];
}

@Component({
  selector: 'app-bill-history',
  imports: [SideDrawerComponent, BillDetailComponent, CustomElementModule],
  templateUrl: './bill-history.component.html',
  styleUrl: './bill-history.component.scss',
})
export class BillHistoryComponent implements OnInit {
  readonly money = money;
  readonly all = ALL;
  readonly statusLabels = BILL_STATUS_LABELS;
  readonly BillStatus = BillStatus;
  readonly statusFilters = [
    BillStatus.Paid,
    BillStatus.Partial,
    BillStatus.Issued,
    BillStatus.Cancelled,
  ];
  readonly today = new Date();

  readonly bills = signal<IBill[]>([]);
  readonly fromControl = new FormControl<Date | null>(null);
  readonly toControl = new FormControl<Date | null>(null);
  readonly quick = signal<number | null>(null);
  readonly searchText = signal('');
  readonly statusFilter = signal<string>(ALL);
  readonly selectedId = signal<string | null>(null);
  readonly shop = signal<IShopSettings | undefined>(undefined);

  readonly filtered = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const digits = mobileDigits(query);
    const status = this.statusFilter();
    return this.bills().filter(
      (b) =>
        (status === ALL || b.status === status) &&
        (!query ||
          b.customerName.toLowerCase().includes(query) ||
          (digits !== '' && mobileDigits(b.customerMobile).includes(digits)) ||
          b.no.toLowerCase().includes(query)),
    );
  });
  readonly active = computed(() => this.filtered().filter((b) => b.status !== BillStatus.Cancelled));
  readonly summary = computed(() => {
    const bills = this.active();
    const sales = bills.reduce((sum, b) => sum + b.total, 0);
    const received = bills.reduce((sum, b) => sum + b.paidAmount, 0);
    return {
      count: bills.length,
      sales,
      received,
      due: sales - received,
      profit: bills.reduce((sum, b) => sum + b.total - b.costTotal, 0),
    };
  });
  readonly groups = computed<IDayGroup[]>(() => {
    const groups = new Map<string, IDayGroup>();
    for (const bill of this.filtered()) {
      const day = customDatetime(bill.date, { get: 'day' });
      let group = groups.get(day);
      if (!group) {
        group = { day, label: this.dayLabel(bill.date), total: 0, bills: [] };
        groups.set(day, group);
      }
      group.bills.push(bill);
      if (bill.status !== BillStatus.Cancelled) group.total += bill.total;
    }
    return [...groups.values()];
  });

  constructor(
    private billHistoryService: BillHistoryService,
    private settingsService: SettingsService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getTableData();
    this.settingsService.getShopSettings().subscribe((shop) => this.shop.set(shop));
  }

  getTableData(): void {
    this.billHistoryService.getBillList(this.fromControl.value, this.toControl.value).subscribe({
      next: (bills) => this.bills.set(bills),
      error: (err) => this.toasters.error('Could not load bills: ' + err.message),
    });
  }

  onRangeChange(): void {
    const from = this.fromControl.value;
    const to = this.toControl.value;
    if (from && to && from > to) {
      this.fromControl.setValue(to);
      this.toControl.setValue(from);
    }
    this.quick.set(null);
    this.getTableData();
  }

  quickRange(days: number | null): void {
    if (days === null) {
      this.fromControl.setValue(null);
      this.toControl.setValue(null);
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - days + 1);
      this.fromControl.setValue(start);
      this.toControl.setValue(new Date());
    }
    this.quick.set(days);
    this.getTableData();
  }

  isQuickRange(days: number | null): boolean {
    return days === null
      ? !this.fromControl.value && !this.toControl.value
      : this.quick() === days;
  }

  private dayLabel(date: string): string {
    const day = customDatetime(date, { get: 'day' });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const text = customDatetime(date, { format: 'ddd, DD MMM YYYY' });
    if (day === customDatetime(new Date(), { get: 'day' })) return 'Today · ' + text;
    if (day === customDatetime(yesterday, { get: 'day' })) return 'Yesterday · ' + text;
    return text;
  }
}
