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
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_DAYS = 92;

type HistoryRange = 'today' | 'week' | 'month' | 'custom';

const RANGE_OPTIONS: { id: HistoryRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

function startOfDay(addDays: number): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + addDays);
  return day;
}

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
  readonly rangeOptions = RANGE_OPTIONS;
  readonly range = signal<HistoryRange>('today');
  readonly fromControl = new FormControl<Date | null>(null);
  readonly toControl = new FormControl<Date | null>(null);
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
  readonly active = computed(() =>
    this.filtered().filter((b) => b.status !== BillStatus.Cancelled),
  );
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

  // Only the chosen period is loaded, so a shop with years of bills stays fast
  getTableData(): void {
    const [from, to] = this.rangeDates();
    if (!from || !to) return;
    this.billHistoryService.getBillList(from, to).subscribe({
      next: (bills) => this.bills.set(bills),
      error: (err) => this.toasters.error('Could not load bills: ' + err.message),
    });
  }

  setRange(range: HistoryRange): void {
    this.range.set(range);
    if (range === 'custom') {
      if (!this.fromControl.value) this.fromControl.setValue(startOfDay(-6));
      if (!this.toControl.value) this.toControl.setValue(new Date());
    }
    this.getTableData();
  }

  onCustomChange(): void {
    let from = this.fromControl.value;
    let to = this.toControl.value;
    if (!from || !to) return;
    if (from > to) {
      [from, to] = [to, from];
      this.fromControl.setValue(from);
      this.toControl.setValue(to);
    }
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_CUSTOM_DAYS) {
      this.toasters.warn(`Pick up to ${MAX_CUSTOM_DAYS} days at a time`);
      return;
    }
    this.getTableData();
  }

  private rangeDates(): [Date | null, Date | null] {
    switch (this.range()) {
      case 'today':
        return [startOfDay(0), new Date()];
      case 'week':
        return [startOfDay(-6), new Date()];
      case 'month': {
        const now = new Date();
        return [new Date(now.getFullYear(), now.getMonth(), 1), now];
      }
      default:
        return [this.fromControl.value, this.toControl.value];
    }
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
