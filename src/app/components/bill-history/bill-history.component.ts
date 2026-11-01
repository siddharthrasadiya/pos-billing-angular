import { Component, computed, OnInit, signal } from '@angular/core';
import {
  avatarHue,
  BILL_STATUS_LABELS,
  BillStatus,
  ILedgerEntry,
  IShopSettings,
  LedgerType,
  mobileDigits,
  money,
  roundMoney,
  sumMoney,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import {
  MonthPickerComponent,
  monthStart,
} from 'src/app/core/shared/month-picker/month-picker.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { IBill } from '../billing/billing.interface';
import { BillDetailComponent } from './bill-detail/bill-detail.component';
import { BillHistoryService } from './bill-history.service';

const ALL = 'all';

type HistoryRange = 'today' | 'week' | 'month' | 'custom';

const RANGE_OPTIONS: { id: HistoryRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Pick month' },
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
  imports: [SideDrawerComponent, BillDetailComponent, CustomElementModule, MonthPickerComponent],
  templateUrl: './bill-history.component.html',
  styleUrl: './bill-history.component.scss',
})
export class BillHistoryComponent implements OnInit {
  readonly money = money;
  readonly avatarHue = avatarHue;
  readonly all = ALL;
  readonly statusLabels = BILL_STATUS_LABELS;
  readonly BillStatus = BillStatus;
  readonly statusFilters = [BillStatus.Issued, BillStatus.Draft, BillStatus.Cancelled];

  readonly bills = signal<IBill[]>([]);
  readonly rangeOptions = RANGE_OPTIONS;
  readonly range = signal<HistoryRange>('today');
  readonly customMonth = signal(monthStart(new Date()));
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
  readonly issued = computed(() => this.filtered().filter((b) => b.status === BillStatus.Issued));
  // Payments are not tied to bills: Received is the money taken in the period (all customers,
  // less money given back) and Due is what all customers owe right now
  readonly payments = signal<ILedgerEntry[]>([]);
  readonly totalDue = signal(0);
  readonly summary = computed(() => {
    const bills = this.issued();
    const sales = sumMoney(bills.map((b) => b.total));
    const signed = this.payments()
      .filter((e) => e.type === LedgerType.PaymentIn || e.type === LedgerType.PaymentOut)
      .map((e) => (e.type === LedgerType.PaymentIn ? e.amount : -e.amount));
    return {
      count: bills.length,
      sales,
      received: sumMoney(signed),
      due: this.totalDue(),
      profit: roundMoney(sales - sumMoney(bills.map((b) => b.costTotal))),
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
      if (bill.status === BillStatus.Issued) group.total = roundMoney(group.total + bill.total);
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
    this.billHistoryService.getBillList(from, to).subscribe({
      next: (bills) => this.bills.set(bills),
      error: (err) => this.toasters.error('Could not load bills: ' + err.message),
    });
    this.billHistoryService.getPayments(from, to).subscribe((p) => this.payments.set(p));
    this.billHistoryService.getTotalDue().subscribe((due) => this.totalDue.set(due));
  }

  setRange(range: HistoryRange): void {
    this.range.set(range);
    this.getTableData();
  }

  setCustomMonth(month: Date): void {
    this.customMonth.set(month);
    this.getTableData();
  }

  private rangeDates(): [Date, Date] {
    switch (this.range()) {
      case 'today':
        return [startOfDay(0), new Date()];
      case 'week':
        return [startOfDay(-6), new Date()];
      case 'month': {
        const now = new Date();
        return [new Date(now.getFullYear(), now.getMonth(), 1), now];
      }
      default: {
        const month = this.customMonth();
        return [month, new Date(month.getFullYear(), month.getMonth() + 1, 0)];
      }
    }
  }

  private dayLabel(date: string): string {
    const day = customDatetime(date, { get: 'day' });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const text = customDatetime(date, { get: 'date' });
    if (day === customDatetime(new Date(), { get: 'day' })) return 'Today · ' + text;
    if (day === customDatetime(yesterday, { get: 'day' })) return 'Yesterday · ' + text;
    return text;
  }
}
