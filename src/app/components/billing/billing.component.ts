import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, effect, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { firstValueFrom } from 'rxjs';
import {
  BILL_LANGUAGE_OPTIONS,
  BillLanguage,
  BillStatus,
  buildReceipt,
  discountAmount,
  DiscountType,
  formatMobile,
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
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { ICustomer } from '../customer-management/customer-management.interface';
import { IProduct } from '../product-management/product-management.interface';
import { ProductManagementService } from '../product-management/product-management.service';
import { IBillRequestModel, ICartLine } from './billing.interface';
import { BillingService } from './billing.service';
import { CustomerPickerComponent } from './customer-picker/customer-picker.component';

const ALL_CATEGORIES = 'all';
const REMOVE_CONFIRM_MS = 2000;
// Matches the 900px breakpoint in billing.component.scss
const WIDE_SCREEN = matchMedia('(min-width: 900px)');

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

@Component({
  selector: 'app-billing',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ReactiveFormsModule,
    InputNumberModule,
    SideDrawerComponent,
    CustomerPickerComponent,
    CustomElementModule,
    IconComponent,
  ],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent implements OnInit {
  readonly isLocal = IS_LOCAL;
  readonly allCategories = ALL_CATEGORIES;
  readonly money = money;
  readonly formatMobile = formatMobile;
  readonly BillStatus = BillStatus;
  readonly DiscountType = DiscountType;
  readonly languageOptions = BILL_LANGUAGE_OPTIONS;
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
  readonly pendingRemove = signal<string | null>(null);
  readonly isWide = signal(WIDE_SCREEN.matches);

  readonly maxBillDate = signal(new Date());
  readonly customer = signal<ICustomer | null>(null);
  readonly discountType = signal(DiscountType.Amount);
  readonly status = signal(BillStatus.Paid);
  readonly printLanguage = signal(BillLanguage.English);
  readonly billDateControl = new FormControl<Date | null>(startOfToday());
  readonly discountControl = new FormControl<number | null>(null);
  readonly receivedControl = new FormControl<number | null>(null);
  private readonly billDate = toSignal(this.billDateControl.valueChanges, {
    initialValue: this.billDateControl.value,
  });
  private readonly discountValue = toSignal(this.discountControl.valueChanges, {
    initialValue: null,
  });
  private readonly received = toSignal(this.receivedControl.valueChanges, { initialValue: null });

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
  readonly productPrice = computed(() => new Map(this.products().map((p) => [p.id, p.sellPrice])));
  readonly cartQty = computed(() => new Map(this.cart().map((l) => [l.productId, l.qty])));
  readonly totalQty = computed(() => this.cart().reduce((sum, l) => sum + l.qty, 0));
  readonly subtotal = computed(() =>
    roundMoney(this.cart().reduce((sum, l) => sum + l.qty * l.rate, 0)),
  );
  readonly discount = computed(() =>
    discountAmount(this.subtotal(), this.discountType(), this.discountValue() ?? 0),
  );
  readonly total = computed(() => roundMoney(this.subtotal() - this.discount()));
  readonly paidAmount = computed(() => {
    switch (this.status()) {
      case BillStatus.Paid:
        return this.total();
      case BillStatus.Partial:
        return Math.min(this.total(), Math.max(0, roundMoney(this.received() ?? 0)));
      default:
        return 0;
    }
  });
  readonly balance = computed(() => roundMoney(this.total() - this.paidAmount()));
  private shop?: IShopSettings;
  private removeTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private billingService: BillingService,
    private productManagementService: ProductManagementService,
    private settingsService: SettingsService,
    private printer: PrinterService,
    private preview: ReceiptPreviewService,
    private toasters: ToastersService,
    destroyRef: DestroyRef,
  ) {
    // The cart renders once, as the side panel on wide screens or the drawer on phones,
    // so its form fields never exist twice
    const onScreenChange = () => {
      this.isWide.set(WIDE_SCREEN.matches);
      if (WIDE_SCREEN.matches) this.cartOpen.set(false);
    };
    WIDE_SCREEN.addEventListener('change', onScreenChange);
    window.addEventListener('resize', onScreenChange);
    destroyRef.onDestroy(() => {
      WIDE_SCREEN.removeEventListener('change', onScreenChange);
      window.removeEventListener('resize', onScreenChange);
    });

    this.restoreDraft();
    effect(() => {
      if (!this.cart().length) {
        this.billingService.clearDraft();
        return;
      }
      this.billingService.saveDraft({
        cart: this.cart(),
        customer: this.customer(),
        billDate: customDatetime(this.billDate(), { get: 'UTC' }),
        discountType: this.discountType(),
        discountValue: this.discountValue(),
        status: this.status(),
        received: this.received(),
        printLanguage: this.printLanguage(),
        savedAt: new Date().toISOString(),
      });
    });
  }

  ngOnInit(): void {
    this.getProducts();
    this.productManagementService.getCategoryList().subscribe((c) => this.categories.set(c));
    this.settingsService.getShopSettings().subscribe((shop) => (this.shop = shop));
  }

  getProducts(): void {
    this.productManagementService.getProductList().subscribe({
      next: (products) => this.products.set(products),
      error: (err) => this.toasters.error('Could not load products: ' + err.message),
    });
  }

  addToCart(product: IProduct): void {
    const qty = (this.cartQty().get(product.id) ?? 0) + 1;
    if (qty > product.stock) {
      this.warnStock(product.name, product.stock);
      return;
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
          localName: product.localName ?? '',
          rate: product.sellPrice,
          cost: product.buyPrice,
          qty: 1,
        },
      ];
    });
  }

  increase(line: ICartLine): void {
    const stock = this.products().find((p) => p.id === line.productId)?.stock ?? 0;
    if (line.qty + 1 > stock) {
      this.warnStock(line.name, stock);
      return;
    }
    this.updateLine(line, { qty: line.qty + 1 });
  }

  private warnStock(name: string, stock: number): void {
    this.toasters.warn(
      stock > 0
        ? `Only ${stock} ${name} in stock. Add a purchase to sell more.`
        : `${name} is out of stock. Add a purchase first.`,
    );
  }

  // A line at qty 1 needs a second tap within 2 seconds, so a stray tap never drops an item
  decrease(line: ICartLine): void {
    if (line.qty > 1) {
      this.updateLine(line, { qty: line.qty - 1 });
      return;
    }
    if (this.pendingRemove() !== line.productId) {
      this.pendingRemove.set(line.productId);
      clearTimeout(this.removeTimer);
      this.removeTimer = setTimeout(() => this.pendingRemove.set(null), REMOVE_CONFIRM_MS);
      return;
    }
    this.pendingRemove.set(null);
    this.cart.update((cart) => cart.filter((l) => l !== line));
    if (!this.cart().length) this.cartOpen.set(false);
  }

  setRate(line: ICartLine, rate: number | null): void {
    this.updateLine(line, { rate: Math.max(0, roundMoney(rate ?? 0)) });
  }

  selectCustomer(customer: ICustomer): void {
    this.customer.set(customer);
    this.printLanguage.set(customer.billLanguage ?? BillLanguage.English);
    this.pickerOpen.set(false);
  }

  clearCustomer(): void {
    this.customer.set(null);
    this.printLanguage.set(BillLanguage.English);
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
        this.toasters.success(`Bill ${bill.no} saved`);
      },
      error: (err) =>
        this.toasters.error('Could not save bill: ' + err.message + '. Items are kept for retry.'),
    });
  }

  private updateLine(line: ICartLine, change: Partial<ICartLine>): void {
    this.pendingRemove.set(null);
    this.cart.update((cart) => cart.map((l) => (l === line ? { ...l, ...change } : l)));
  }

  private restoreDraft(): void {
    const draft = this.billingService.getDraft();
    if (!draft?.cart?.length) return;
    this.cart.set(draft.cart);
    this.customer.set(draft.customer);
    this.billDateControl.setValue(draft.billDate ? new Date(draft.billDate) : startOfToday());
    this.discountType.set(draft.discountType);
    this.discountControl.setValue(draft.discountValue);
    this.status.set(draft.status);
    this.receivedControl.setValue(draft.received);
    this.printLanguage.set(draft.printLanguage ?? BillLanguage.English);
    this.toasters.info('Your unsaved bill was restored', 'Bill restored');
  }

  private resetBill(): void {
    this.maxBillDate.set(new Date());
    this.cart.set([]);
    this.clearCustomer();
    this.billDateControl.setValue(startOfToday());
    this.discountType.set(DiscountType.Amount);
    this.discountControl.setValue(null);
    this.status.set(BillStatus.Paid);
    this.receivedControl.setValue(null);
    this.cartOpen.set(false);
    this.billingService.clearDraft();
  }

  private async createBill(): Promise<IBillRequestModel | null> {
    if (!this.cart().length) {
      this.toasters.warn('Cart is empty');
      return null;
    }
    if (this.status() === BillStatus.Partial && !(this.paidAmount() > 0 && this.balance() > 0)) {
      this.toasters.warn('For partial payment, enter an amount more than 0 and less than total');
      return null;
    }
    const date = this.billDateTime();
    const customer = this.customer();
    return {
      no: await firstValueFrom(this.billingService.getNextBillNo(date)),
      date: customDatetime(date, { get: 'UTC' }),
      customerId: customer?.id ?? '',
      customerName: customer?.name ?? '',
      customerMobile: customer?.mobile ?? '',
      subtotal: this.subtotal(),
      discountType: this.discountType(),
      discountValue: this.discountValue() ?? 0,
      discount: this.discount(),
      total: this.total(),
      status: this.status(),
      paidAmount: this.paidAmount(),
      printLanguage: this.printLanguage(),
      items: this.cart(),
    };
  }

  // The picked day plus the current time of day, so back-dated bills of a day stay in order
  private billDateTime(): Date {
    const now = new Date();
    const picked = this.billDate() ?? now;
    return new Date(
      picked.getFullYear(),
      picked.getMonth(),
      picked.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    );
  }
}
