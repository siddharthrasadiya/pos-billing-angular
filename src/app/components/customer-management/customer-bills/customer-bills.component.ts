import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  BILL_STATUS_LABELS,
  BillStatus,
  IShopSettings,
  money,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { IBill } from '../../billing/billing.interface';
import { BillDetailComponent } from '../../bill-history/bill-detail/bill-detail.component';
import { BillHistoryService } from '../../bill-history/bill-history.service';
import { ICustomer } from '../customer-management.interface';

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// One month per load, so a regular customer with years of bills stays fast
@Component({
  selector: 'app-customer-bills',
  imports: [SideDrawerComponent, BillDetailComponent, CustomElementModule, IconComponent],
  templateUrl: './customer-bills.component.html',
  styleUrl: './customer-bills.component.scss',
})
export class CustomerBillsComponent {
  readonly customer = input<ICustomer | null>(null);
  readonly shop = input<IShopSettings | undefined>(undefined);

  readonly money = money;
  readonly statusLabels = BILL_STATUS_LABELS;
  readonly BillStatus = BillStatus;
  readonly thisMonth = monthStart(new Date());
  readonly monthControl = new FormControl<Date | null>(this.thisMonth);
  readonly month = signal(this.thisMonth);
  readonly bills = signal<IBill[]>([]);
  readonly loading = signal(false);
  readonly selectedId = signal<string | null>(null);

  readonly isThisMonth = computed(() => this.month().getTime() === this.thisMonth.getTime());
  readonly summary = computed(() => {
    const bills = this.bills().filter((b) => b.status !== BillStatus.Cancelled);
    const total = bills.reduce((sum, b) => sum + b.total, 0);
    return {
      count: bills.length,
      total,
      due: total - bills.reduce((sum, b) => sum + b.paidAmount, 0),
    };
  });
  readonly groups = computed(() => {
    const groups = new Map<string, { day: string; label: string; total: number; bills: IBill[] }>();
    for (const bill of this.bills()) {
      const day = customDatetime(bill.date, { get: 'day' });
      let group = groups.get(day);
      if (!group) {
        group = {
          day,
          label: customDatetime(bill.date, { format: 'ddd, DD MMM' }),
          total: 0,
          bills: [],
        };
        groups.set(day, group);
      }
      group.bills.push(bill);
      if (bill.status !== BillStatus.Cancelled) group.total += bill.total;
    }
    return [...groups.values()];
  });

  constructor(
    private billHistoryService: BillHistoryService,
    private toasters: ToastersService,
  ) {
    effect(() => {
      if (!this.customer()) return;
      untracked(() => {
        this.selectedId.set(null);
        this.setMonth(this.thisMonth);
      });
    });
  }

  getTableData(): void {
    const customer = this.customer();
    if (!customer) return;
    this.loading.set(true);
    this.billHistoryService.getCustomerBills(customer.id, this.month()).subscribe({
      next: (bills) => {
        this.bills.set(bills);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toasters.error('Could not load bills: ' + err.message);
      },
    });
  }

  setMonth(date: Date | null): void {
    if (!date) {
      this.monthControl.setValue(this.month());
      return;
    }
    const month = monthStart(date);
    this.month.set(month);
    this.monthControl.setValue(month);
    this.getTableData();
  }

  shiftMonth(by: number): void {
    const month = this.month();
    this.setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  }
}
