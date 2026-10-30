import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BillStatus,
  buildReceipt,
  dayKey,
  discountAmount,
  DiscountType,
  ICategory,
  IS_LOCAL,
  IShopSettings,
  money,
  PrinterService,
  ReceiptPreviewService,
  roundMoney,
  searchProducts,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { ICustomer } from '../customer-management/customer-management.interface';
import { IProduct } from '../product-management/product-management.interface';
import { ProductManagementService } from '../product-management/product-management.service';
import { IBillRequestModel, ICartLine } from './billing.interface';
import { BillingService } from './billing.service';
import { CustomerPickerComponent } from './customer-picker/customer-picker.component';

const ALL_CATEGORIES = 'all';

@Component({
  selector: 'app-billing',
  imports: [NgTemplateOutlet, SideDrawerComponent, CustomerPickerComponent],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent implements OnInit {
  readonly isLocal = IS_LOCAL;
  readonly allCategories = ALL_CATEGORIES;
  readonly money = money;
  readonly BillStatus = BillStatus;
  readonly DiscountType = DiscountType;
  readonly paymentOptions = [
    { status: BillStatus.Paid, label: 'Paid' },
    { status: BillStatus.Partial, label: 'Partial' },
    { status: BillStatus.Issued, label: 'Issued' },
  ];

  readonly products = signal<IProduct[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly cart = signal<ICartLine[]>([]);
  readonly searchText = signal('');
  readonly categoryFilter = signal(ALL_CATEGORIES);
  readonly cartOpen = signal(false);
  readonly pickerOpen = signal(false);

  readonly today = signal(dayKey(new Date()));
  readonly customer = signal<ICustomer | null>(null);
  readonly billDate = signal(dayKey(new Date()));
  readonly discountType = signal(DiscountType.Amount);
  readonly discountValue = signal(0);
  readonly status = signal(BillStatus.Paid);
  readonly receivedInput = signal(0);

  readonly usedCategories = computed(() =>
    this.categories()
      .filter((c) => this.products().some((p) => p.categoryId === c.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly filteredProducts = computed(() => {
    const filter = this.categoryFilter();
    const inFilter = this.products().filter(
      (p) => filter === ALL_CATEGORIES || p.categoryId === filter,
    );
    return searchProducts(inFilter, this.searchText());
  });
  readonly cartQty = computed(() => new Map(this.cart().map((l) => [l.productId, l.qty])));
  readonly totalQty = computed(() => this.cart().reduce((sum, l) => sum + l.qty, 0));
  readonly subtotal = computed(() =>
    roundMoney(this.cart().reduce((sum, l) => sum + l.qty * l.rate, 0)),
  );
  readonly discount = computed(() =>
    discountAmount(this.subtotal(), this.discountType(), this.discountValue()),
  );
  readonly total = computed(() => roundMoney(this.subtotal() - this.discount()));
  readonly paidAmount = computed(() => {
    switch (this.status()) {
      case BillStatus.Paid:
        return this.total();
      case BillStatus.Partial:
        return Math.min(this.total(), Math.max(0, roundMoney(this.receivedInput())));
      default:
        return 0;
    }
  });
  readonly balance = computed(() => roundMoney(this.total() - this.paidAmount()));
  private shop?: IShopSettings;

  constructor(
    private billingService: BillingService,
    private productManagementService: ProductManagementService,
    private settingsService: SettingsService,
    private printer: PrinterService,
    private preview: ReceiptPreviewService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getProducts();
    this.productManagementService.getCategoryList().subscribe((c) => this.categories.set(c));
    this.settingsService.getShopSettings().subscribe((shop) => (this.shop = shop));
  }

  getProducts(): void {
    this.productManagementService.getProductList().subscribe({
      next: (products) => this.products.set(products),
      error: (err) => this.toasters.show('Could not load products: ' + err.message),
    });
  }

  addToCart(product: IProduct): void {
    const qty = (this.cartQty().get(product.id) ?? 0) + 1;
    if (qty > product.stock) {
      this.toasters.show(`Only ${product.stock} ${product.name} in stock`);
    }
    this.cart.update((cart) => {
      const line = cart.find((l) => l.productId === product.id);
      if (line) {
        return cart.map((l) => (l === line ? { ...l, qty } : l));
      }
      return [
        ...cart,
        {
          productId: product.id,
          name: product.name,
          rate: product.sellPrice,
          cost: product.buyPrice,
          qty: 1,
        },
      ];
    });
  }

  changeQty(line: ICartLine, delta: number): void {
    this.cart.update((cart) =>
      cart
        .map((l) => (l === line ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
    if (!this.cart().length) this.cartOpen.set(false);
  }

  selectCustomer(customer: ICustomer): void {
    this.customer.set(customer);
    this.pickerOpen.set(false);
  }

  setNumber(target: EventTarget | null, apply: (value: number) => void): void {
    const value = Number((target as HTMLInputElement).value);
    apply(Number.isFinite(value) && value > 0 ? value : 0);
  }

  setBillDate(value: string): void {
    this.billDate.set(value && value <= this.today() ? value : this.today());
  }

  clearCart(): void {
    if (this.cart().length > 1 && !confirm('Remove all items from this bill?')) return;
    this.resetBill();
  }

  async webPrint(): Promise<void> {
    const bill = await this.createBill();
    if (bill && this.shop) this.preview.show(buildReceipt(this.shop, bill));
  }

  async saveBill(print: boolean): Promise<void> {
    const bill = await this.createBill();
    if (!bill || !this.shop) return;

    if (print) {
      const printed = await this.printer.print(buildReceipt(this.shop, bill));
      if (!printed && !confirm('Print failed. Save the bill anyway?')) return;
    }

    this.billingService.saveBill(bill).subscribe({
      next: () => {
        this.resetBill();
        this.getProducts();
        this.toasters.show(`Bill ${bill.no} saved`);
      },
      error: (err) => this.toasters.show('Could not save bill: ' + err.message),
    });
  }

  private resetBill(): void {
    this.today.set(dayKey(new Date()));
    this.cart.set([]);
    this.customer.set(null);
    this.billDate.set(this.today());
    this.discountType.set(DiscountType.Amount);
    this.discountValue.set(0);
    this.status.set(BillStatus.Paid);
    this.receivedInput.set(0);
    this.cartOpen.set(false);
  }

  private async createBill(): Promise<IBillRequestModel | null> {
    if (!this.cart().length) {
      this.toasters.show('Cart is empty');
      return null;
    }
    if (this.status() === BillStatus.Partial && !(this.paidAmount() > 0 && this.balance() > 0)) {
      this.toasters.show('For partial payment, enter an amount more than 0 and less than total');
      return null;
    }
    const date = this.billDateTime();
    const customer = this.customer();
    return {
      no: await firstValueFrom(this.billingService.getNextBillNo(date)),
      date: date.toISOString(),
      customerId: customer?.id ?? '',
      customerName: customer?.name ?? '',
      customerMobile: customer?.mobile ?? '',
      subtotal: this.subtotal(),
      discountType: this.discountType(),
      discountValue: this.discountValue(),
      discount: this.discount(),
      total: this.total(),
      status: this.status(),
      paidAmount: this.paidAmount(),
      items: this.cart(),
    };
  }

  // A back-dated bill keeps the current time of day, so bills of that day stay in order
  private billDateTime(): Date {
    const now = new Date();
    if (this.billDate() === dayKey(now)) return now;
    const [y, m, d] = this.billDate().split('-').map(Number);
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  }
}
