import { Component, computed, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  avatarHue,
  balanceLabel,
  formatMobile,
  ICategory,
  IShopSettings,
  LedgerType,
  money,
  SettingsService,
  ToastersService,
  WALK_IN_CUSTOMER_ID,
  SecurityService,
} from 'src/app/core.index';
import { CategoryManagerComponent } from 'src/app/core/shared/category-manager/category-manager.component';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { CustomerAddEditComponent } from './customer-add-edit/customer-add-edit.component';
import { CustomerBillsComponent } from './customer-bills/customer-bills.component';
import { ICustomer } from './customer-management.interface';
import { CustomerManagementService, searchCustomers } from './customer-management.service';
import {
  CustomerPaymentComponent,
  PaymentDirection,
} from './customer-payment/customer-payment.component';
import { CustomerStatementComponent } from './customer-statement/customer-statement.component';

const ALL_CATEGORIES = 'all';

type CustomerDrawer =
  'customer' | 'categories' | 'actions' | 'call' | 'payment' | 'statement' | 'bills';

@Component({
  selector: 'app-customer-management',
  imports: [
    SideDrawerComponent,
    CustomerAddEditComponent,
    CategoryManagerComponent,
    IconComponent,
    CustomElementModule,
    CustomerBillsComponent,
    CustomerPaymentComponent,
    CustomerStatementComponent,
  ],
  templateUrl: './customer-management.component.html',
  styleUrl: './customer-management.component.scss',
})
export class CustomerManagementComponent implements OnInit {
  readonly formatMobile = formatMobile;
  readonly avatarHue = avatarHue;
  readonly balanceLabel = balanceLabel;
  readonly money = money;
  readonly abs = Math.abs;
  readonly LedgerType = LedgerType;
  readonly walkInId = WALK_IN_CUSTOMER_ID;
  readonly customers = signal<ICustomer[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly editing = signal<ICustomer | null>(null);
  // Customer the More menu, call list, payment, statement or bills drawer is about
  readonly selected = signal<ICustomer | null>(null);
  readonly paymentDirection = signal<PaymentDirection>(LedgerType.PaymentIn);
  readonly drawer = signal<CustomerDrawer | null>(null);
  readonly shop = signal<IShopSettings | undefined>(undefined);
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly categoryControl = new FormControl(ALL_CATEGORIES, { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  private readonly categoryFilter = toSignal(this.categoryControl.valueChanges, {
    initialValue: ALL_CATEGORIES,
  });

  readonly sortedCategories = computed(() =>
    [...this.categories()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly filterOptions = computed(() => [
    { id: ALL_CATEGORIES, name: 'All categories' },
    ...this.sortedCategories(),
    { id: '', name: 'No category' },
  ]);
  // Only shops that owe money, biggest due first, for a quick collection round
  readonly onlyDue = signal(false);
  readonly dueCount = computed(() => this.customers().filter((c) => c.balance > 0).length);
  readonly tableData = computed(() => {
    const filter = this.categoryFilter();
    const onlyDue = this.onlyDue();
    const inFilter = this.customers().filter(
      (c) => (filter === ALL_CATEGORIES || c.categoryId === filter) && (!onlyDue || c.balance > 0),
    );
    if (onlyDue) {
      return searchCustomers(inFilter, this.categories(), this.searchText()).sort(
        (a, b) => b.balance - a.balance,
      );
    }
    return searchCustomers(inFilter, this.categories(), this.searchText());
  });
  readonly totalDue = computed(() =>
    this.customers().reduce((sum, c) => sum + Math.max(0, c.balance ?? 0), 0),
  );

  readonly customerCount = (category: ICategory) =>
    this.customers().filter((c) => c.categoryId === category.id).length;
  private readonly addEdit = viewChild(CustomerAddEditComponent);

  constructor(
    protected customerManagementService: CustomerManagementService,
    private settingsService: SettingsService,
    private security: SecurityService,
    private toasters: ToastersService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.getTableData();
    this.settingsService.getShopSettings().subscribe((shop) => this.shop.set(shop));
  }

  getTableData(): void {
    forkJoin({
      customers: this.customerManagementService.getCustomerList(),
      categories: this.customerManagementService.getCategoryList(),
    }).subscribe({
      next: ({ customers, categories }) => {
        this.customers.set(customers);
        this.categories.set(categories);
        const open = this.selected();
        if (open) this.selected.set(customers.find((c) => c.id === open.id) ?? null);
        const filter = this.categoryFilter();
        if (
          filter !== ALL_CATEGORIES &&
          filter !== '' &&
          !categories.some((c) => c.id === filter)
        ) {
          this.categoryControl.setValue(ALL_CATEGORIES);
        }
      },
      error: (err) => this.toasters.error('Could not load customers: ' + err.message),
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }

  add(): void {
    this.editing.set(null);
    this.drawer.set('customer');
  }

  openActions(customer: ICustomer): void {
    this.selected.set(customer);
    this.drawer.set('actions');
  }

  // One number dials straight away; more numbers show the list first
  call(customer: ICustomer): void {
    const contacts = customer.contacts?.length
      ? customer.contacts
      : [{ name: '', mobile: customer.mobile }];
    if (contacts.length === 1) {
      location.href = 'tel:' + contacts[0].mobile;
      return;
    }
    this.selected.set(customer);
    this.drawer.set('call');
  }

  newBill(customer: ICustomer): void {
    this.router.navigate(['/billing'], { queryParams: { customer: customer.id } });
  }

  // Taking money is everyday work; giving money back needs the owner
  async openPayment(customer: ICustomer, direction: PaymentDirection): Promise<void> {
    if (direction === LedgerType.PaymentOut && !(await this.security.allow('give money back'))) {
      return;
    }
    this.selected.set(customer);
    this.paymentDirection.set(direction);
    this.drawer.set('payment');
  }

  open(drawer: 'statement' | 'bills', customer: ICustomer): void {
    this.selected.set(customer);
    this.drawer.set(drawer);
  }

  async openCategories(): Promise<void> {
    if (await this.security.allow('change categories')) this.drawer.set('categories');
  }

  async edit(customer: ICustomer): Promise<void> {
    if (!(await this.security.allow('edit this customer'))) return;
    this.editing.set(customer);
    this.drawer.set('customer');
  }

  closeDrawer(): void {
    this.drawer.set(null);
    this.editing.set(null);
    this.addEdit()?.resetForm();
  }

  onSaved(): void {
    this.closeDrawer();
    this.getTableData();
  }

  onPaymentSaved(): void {
    this.drawer.set('actions');
    this.getTableData();
  }

  async delete(customer: ICustomer): Promise<void> {
    if (!(await this.security.allow('delete this customer'))) return;
    if (!confirm(`Delete "${customer.name}"? Old bills keep the customer name.`)) return;
    this.customerManagementService.deleteCustomer(customer.id).subscribe({
      next: () => {
        this.toasters.success('Customer deleted');
        this.closeDrawer();
        this.getTableData();
      },
      error: (err) => this.toasters.error('Could not delete: ' + err.message),
    });
  }
}
