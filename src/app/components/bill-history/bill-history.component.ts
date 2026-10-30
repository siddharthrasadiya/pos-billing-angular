import { Component, computed, OnInit, signal } from '@angular/core';
import {
  BILL_STATUS_LABELS,
  BillStatus,
  dayKey,
  IShopSettings,
  mobileDigits,
  money,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
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
  imports: [SideDrawerComponent, BillDetailComponent],
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
  readonly today = dayKey(new Date());

  readonly bills = signal<IBill[]>([]);
  readonly from = signal('');
  readonly to = signal('');
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
      const day = dayKey(new Date(bill.date));
      let group = groups.get(day);
      if (!group) {
        group = { day, label: this.dayLabel(day), total: 0, bills: [] };
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
    this.billHistoryService.getBillList(this.from(), this.to()).subscribe({
      next: (bills) => this.bills.set(bills),
      error: (err) => this.toasters.error('Could not load bills: ' + err.message),
    });
  }

  setRange(from: string, to: string): void {
    if (from && to && from > to) [from, to] = [to, from];
    this.from.set(from);
    this.to.set(to);
    this.getTableData();
  }

  quickRange(days: number | null): void {
    if (days === null) {
      this.setRange('', '');
      return;
    }
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    this.setRange(dayKey(start), this.today);
  }

  isQuickRange(days: number | null): boolean {
    if (days === null) return !this.from() && !this.to();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    return this.from() === dayKey(start) && this.to() === this.today;
  }

  time(bill: IBill): string {
    return new Date(bill.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  private dayLabel(day: string): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const [y, m, d] = day.split('-').map(Number);
    const text = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (day === this.today) return 'Today · ' + text;
    if (day === dayKey(yesterday)) return 'Yesterday · ' + text;
    return text;
  }
}
