import { Component, effect, input, signal, untracked } from '@angular/core';
import {
  balanceLabel,
  BILL_STATUS_LABELS,
  BillStatus,
  DEFAULT_CUSTOMER_BILL_LIMIT,
  IShopSettings,
  money,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { BillDetailComponent } from '../../bill-history/bill-detail/bill-detail.component';
import { BillHistoryService } from '../../bill-history/bill-history.service';
import { IBill } from '../../billing/billing.interface';
import { ICustomer } from '../customer-management.interface';
import { CustomerManagementService } from '../customer-management.service';

// The customer's due right now and their kept bills (newest first, as many as the bill limit in
// Settings; older ones are deleted automatically); payments are in the statement
@Component({
  selector: 'app-customer-bills',
  imports: [SideDrawerComponent, BillDetailComponent, CustomElementModule],
  templateUrl: './customer-bills.component.html',
  styleUrl: './customer-bills.component.scss',
})
export class CustomerBillsComponent {
  readonly customer = input<ICustomer | null>(null);
  readonly shop = input<IShopSettings | undefined>(undefined);

  readonly money = money;
  readonly balanceLabel = balanceLabel;
  readonly statusLabels = BILL_STATUS_LABELS;
  readonly BillStatus = BillStatus;
  readonly lastBills = signal(DEFAULT_CUSTOMER_BILL_LIMIT);
  readonly bills = signal<IBill[]>([]);
  readonly balance = signal<number | null>(null);
  readonly selectedId = signal<string | null>(null);

  constructor(
    private billHistoryService: BillHistoryService,
    private customerManagementService: CustomerManagementService,
    private settingsService: SettingsService,
    private toasters: ToastersService,
  ) {
    effect(() => {
      if (!this.customer()) return;
      untracked(() => {
        this.selectedId.set(null);
        this.getTableData();
      });
    });
  }

  getTableData(): void {
    const customer = this.customer();
    if (!customer) return;
    this.settingsService.getShopSettings().subscribe((shop) => {
      this.lastBills.set(shop.customerBillLimit);
      this.billHistoryService
        .getRecentCustomerBills(customer.id, shop.customerBillLimit)
        .subscribe({
          next: (bills) => this.bills.set(bills),
          error: (err) => this.toasters.error('Could not load bills: ' + err.message),
        });
    });
    this.customerManagementService
      .getCustomer(customer.id)
      .subscribe((c) => this.balance.set(c?.balance ?? 0));
  }
}
