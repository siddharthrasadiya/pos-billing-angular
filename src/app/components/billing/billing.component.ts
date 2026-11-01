import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, effect, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputNumberModule } from 'primeng/inputnumber';
import {
  balanceLabel,
  BILL_LANGUAGE_OPTIONS,
  AutoBackupService,
  BillLanguage,
  buildReceipt,
  discountAmount,
  DiscountType,
  formatMobile,
  formatStock,
  hasSubUnit,
  ICategory,
  IS_LOCAL,
  IShopSettings,
  mainUnit,
  MAX_PRICE,
  money,
  newId,
  PAYMENT_MODE_OPTIONS,
  PaymentMode,
  PrinterService,
  ReceiptPreviewService,
  roundMoney,
  searchProducts,
  SettingsService,
  ToastersService,
  unitFactor,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { ICustomer } from '../customer-management/customer-management.interface';
import { CustomerManagementService } from '../customer-management/customer-management.service';
import { IProduct } from '../product-management/product-management.interface';
import { ProductManagementService } from '../product-management/product-management.service';
import { IBill, IBillRequestModel, ICartLine } from './billing.interface';
import { BillingService } from './billing.service';
import { CustomerPickerComponent } from './customer-picker/customer-picker.component';

const ALL_CATEGORIES = 'all';
const REMOVE_CONFIRM_MS = 2000;
// Matches the 900px breakpoint in billing.component.scss
const WIDE_SCREEN = matchMedia('(min-width: 900px)');

// Base units one of this line takes from stock
function lineFactor(line: ICartLine): number {
  return line.factor ?? 1;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

type SaveAction = 'draft' | 'issue' | 'print';

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
  readonly maxPrice = MAX_PRICE;
  readonly isLocal = IS_LOCAL;
  readonly allCategories = ALL_CATEGORIES;
  readonly money = money;
  readonly balanceLabel = balanceLabel;
  readonly abs = Math.abs;
  readonly formatMobile = formatMobile;
  readonly formatStock = formatStock;
  readonly mainUnit = mainUnit;
  readonly hasSubUnit = hasSubUnit;
  readonly DiscountType = DiscountType;
  readonly languageOptions = BILL_LANGUAGE_OPTIONS;
  readonly paymentModes = PAYMENT_MODE_OPTIONS;

  readonly products = signal<IProduct[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly cart = signal<ICartLine[]>([]);
  readonly searchText = signal('');
  readonly categoryFilter = signal(ALL_CATEGORIES);
  readonly cartOpen = signal(false);
  readonly pickerOpen = signal(false);
  readonly pendingRemove = signal<string | null>(null);
  readonly isWide = signal(WIDE_SCREEN.matches);
  readonly saving = signal(false);

  readonly maxBillDate = signal(new Date());
  // No customer is chosen by default; walk-in is a customer too and must be picked on purpose
  readonly customer = signal<ICustomer | null>(null);
  // Set while editing a saved draft, so saving updates it instead of making a new bill
  readonly draftId = signal<string | null>(null);
  readonly discountType = signal(DiscountType.Amount);
  readonly paymentMode = signal(PaymentMode.Cash);
  readonly printLanguage = signal(BillLanguage.English);
  // Gujarati names show only on a Gujarati bill, so an English bill stays clean
  readonly isGujarati = computed(() => this.printLanguage() === BillLanguage.Gujarati);
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
  readonly categoryNames = computed(() => new Map(this.categories().map((c) => [c.id, c.name])));
  readonly filteredProducts = computed(() => {
    const filter = this.categoryFilter();
    const inFilter = this.products().filter(
      (p) => filter === ALL_CATEGORIES || p.categoryId === filter,
    );
    return searchProducts(inFilter, this.searchText());
  });
  readonly productById = computed(() => new Map(this.products().map((p) => [p.id, p])));
  // Quantity per product as entered over all its lines, for the card badge
  readonly cartQty = computed(() => {
    const qty = new Map<string, number>();
    for (const l of this.cart()) qty.set(l.productId, (qty.get(l.productId) ?? 0) + l.qty);
    return qty;
  });
  // Base units per product over all its lines (2 box of 30 + 5 pcs = 65), for the stock check
  readonly cartBaseQty = computed(() => {
    const qty = new Map<string, number>();
    for (const l of this.cart()) {
      qty.set(l.productId, (qty.get(l.productId) ?? 0) + l.qty * lineFactor(l));
    }
    return qty;
  });
  readonly totalQty = computed(() => this.cart().reduce((sum, l) => sum + l.qty, 0));
  readonly subtotal = computed(() =>
    roundMoney(this.cart().reduce((sum, l) => sum + l.qty * l.rate, 0)),
  );
  readonly discount = computed(() =>
    discountAmount(this.subtotal(), this.discountType(), this.discountValue() ?? 0),
  );
  readonly total = computed(() => roundMoney(this.subtotal() - this.discount()));
  // Money taken at the counter now; more than the bill is fine and becomes advance
  readonly receivedNow = computed(() => Math.max(0, roundMoney(this.received() ?? 0)));
  // The customer's account (fresh from the database) and what it becomes once this bill is issued
  readonly currentBalance = signal<number | null>(null);
  readonly balanceAfter = computed(() =>
    roundMoney((this.currentBalance() ?? 0) + this.total() - this.receivedNow()),
  );
  private shop?: IShopSettings;
  private removeTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private billingService: BillingService,
    private customerManagementService: CustomerManagementService,
    private productManagementService: ProductManagementService,
    private settingsService: SettingsService,
    private printer: PrinterService,
    private autoBackup: AutoBackupService,
    private preview: ReceiptPreviewService,
    private toasters: ToastersService,
    private route: ActivatedRoute,
    private router: Router,
    private destroyRef: DestroyRef,
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
      if (!this.cart().length && !this.draftId()) {
        this.billingService.clearDraft();
        return;
      }
      this.billingService.saveDraft({
        cart: this.cart(),
        customer: this.customer(),
        draftId: this.draftId(),
        billDate: customDatetime(this.billDate(), { get: 'UTC' }),
        discountType: this.discountType(),
        discountValue: this.discountValue(),
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
    // Opened from the customer list (New bill) or from a draft bill (Edit draft); listened to,
    // not read once, because the Bill screen may already be open
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const draft = params.get('draft');
      const customer = params.get('customer');
      if (draft) this.openDraft(draft);
      else if (customer) this.openForCustomer(customer);
    });
  }

  getProducts(): void {
    this.productManagementService.getProductList().subscribe({
      next: (products) => this.products.set(products),
      error: (err) => this.toasters.error('Could not load products: ' + err.message),
    });
  }

  // Tapping a product again adds to its line. A new line is in the primary unit; when less than
  // one primary unit is left it goes in the secondary unit, so loose stock can still be sold
  addToCart(product: IProduct): void {
    const lines = this.cart().filter((l) => l.productId === product.id);
    const left = product.stock - (this.cartBaseQty().get(product.id) ?? 0);
    if (lines.length) {
      const last = lines[lines.length - 1];
      const loose = lines.find((l) => this.isSubUnitLine(l));
      if (left > 0 && left < lineFactor(last) && loose) {
        this.increase(loose);
        return;
      }
      if (left <= 0 || left >= lineFactor(last)) {
        this.increase(last);
        return;
      }
    }
    const useSub = hasSubUnit(product) && left > 0 && left < unitFactor(product);
    const units = this.lineUnits(product, useSub);
    if (!this.hasStockFor(product.id, product.name, units.factor)) return;
    this.cart.update((cart) => [
      ...cart,
      {
        lineId: newId(),
        productId: product.id,
        name: product.name,
        localName: product.localName ?? '',
        categoryName: this.categoryNames().get(product.categoryId) ?? '',
        cost: roundMoney(product.buyPrice * units.factor),
        qty: 1,
        ...units,
      },
    ]);
  }

  // Unit, base units and list price of a line in the primary or secondary unit; products with
  // one unit keep no unit on the line, so their bills look as before
  private lineUnits(
    product: IProduct,
    useSub: boolean,
  ): { unit?: string; factor: number; rate: number } {
    if (!hasSubUnit(product)) return { factor: 1, rate: product.sellPrice };
    const factor = useSub ? 1 : unitFactor(product);
    return {
      unit: useSub ? product.subUnit : mainUnit(product),
      factor,
      rate: this.listRate(product, factor),
    };
  }

  private listRate(product: IProduct, factor: number): number {
    return roundMoney((product.sellPrice * factor) / unitFactor(product));
  }

  // List price for the line's unit, to show when the line price was changed by hand
  lineListRate(line: ICartLine): number | null {
    const product = this.productById().get(line.productId);
    return product ? this.listRate(product, lineFactor(line)) : null;
  }

  isSubUnitLine(line: ICartLine): boolean {
    const product = this.productById().get(line.productId);
    return !!product && hasSubUnit(product) && lineFactor(line) === 1;
  }

  // Switching box / pcs resets the price to the list price of that unit and keeps the
  // quantity if it fits in stock
  setLineUnit(line: ICartLine, useSub: boolean): void {
    const product = this.productById().get(line.productId);
    if (!product || this.isSubUnitLine(line) === useSub) return;
    const units = this.lineUnits(product, useSub);
    const inOtherLines = (this.cartBaseQty().get(product.id) ?? 0) - line.qty * lineFactor(line);
    const fits = Math.floor((product.stock - inOtherLines) / units.factor);
    if (fits < 1) {
      this.warnStock(product.name, product.stock, product);
      return;
    }
    this.updateLine(line, {
      ...units,
      cost: roundMoney(product.buyPrice * units.factor),
      qty: Math.min(line.qty, fits),
    });
  }

  // Typed quantity: whole number, at least 1, and no more than the stock left for this line
  // (other lines of the same product count too)
  setQty(line: ICartLine, input: HTMLInputElement): void {
    const typed = Math.floor(Number(input.value));
    if (!Number.isFinite(typed) || typed < 1) {
      input.value = String(line.qty);
      return;
    }
    const product = this.productById().get(line.productId);
    const stock = product?.stock ?? 0;
    const factor = lineFactor(line);
    const otherLines = (this.cartBaseQty().get(line.productId) ?? 0) - line.qty * factor;
    const allowed = Math.max(1, Math.floor((stock - otherLines) / factor));
    if (typed > allowed) this.warnStock(line.name, stock, product);
    const qty = Math.min(typed, allowed);
    input.value = String(qty);
    this.updateLine(line, { qty });
  }

  increase(line: ICartLine): void {
    if (this.hasStockFor(line.productId, line.name, lineFactor(line))) {
      this.updateLine(line, { qty: line.qty + 1 });
    }
  }

  // One more of the line's unit must fit in stock together with all lines of that product
  private hasStockFor(productId: string, name: string, need: number): boolean {
    const product = this.productById().get(productId);
    const stock = product?.stock ?? 0;
    if ((this.cartBaseQty().get(productId) ?? 0) + need <= stock) return true;
    this.warnStock(name, stock, product);
    return false;
  }

  private warnStock(name: string, stock: number, product?: IProduct): void {
    const left = product ? formatStock(stock, product) : String(stock);
    this.toasters.warn(
      stock > 0
        ? `Only ${left} of ${name} in stock. Add a purchase to sell more.`
        : `${name} is out of stock. Add a purchase first.`,
    );
  }

  // A line at qty 1 needs a second tap within 2 seconds, so a stray tap never drops an item
  decrease(line: ICartLine): void {
    if (line.qty > 1) {
      this.updateLine(line, { qty: line.qty - 1 });
      return;
    }
    if (this.pendingRemove() !== line.lineId) {
      this.pendingRemove.set(line.lineId);
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
    this.loadBalance(customer.id);
  }

  clearCustomer(): void {
    this.customer.set(null);
    this.currentBalance.set(null);
    this.printLanguage.set(BillLanguage.English);
  }

  clearCart(): void {
    if (this.cart().length > 1 && !confirm('Remove all items from this bill?')) return;
    this.resetBill();
  }

  webPrint(): void {
    const bill = this.createBill();
    if (bill && this.shop) {
      this.preview.show(
        buildReceipt(this.shop, {
          ...bill,
          no: 'PREVIEW',
          previousBalance: this.currentBalance() ?? 0,
          balanceAfter: this.balanceAfter(),
        }),
      );
    }
  }

  // A second tap while saving is ignored, so a double tap never tries to make two bills.
  // The bill is saved first and printed after, so a printer problem never loses a bill
  save(action: SaveAction): void {
    if (this.saving()) return;
    const bill = this.createBill();
    if (!bill) return;
    this.saving.set(true);
    const draftId = this.draftId();
    const request =
      action === 'draft'
        ? this.billingService.saveDraftBill(bill, draftId)
        : this.billingService.issueBill(bill, draftId, this.paymentMode());
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.resetBill();
        this.getProducts();
        if (action === 'draft') {
          this.toasters.success('Draft saved. Stock and account are not changed yet');
          return;
        }
        this.toasters.success(`Bill ${saved.no} issued`);
        this.autoBackup.noteBillIssued();
        if (action === 'print') this.print(saved, bill);
      },
      error: (err) => {
        this.saving.set(false);
        this.toasters.error('Could not save bill: ' + err.message + '. Items are kept for retry.');
      },
    });
  }

  private async print(saved: IBill, bill: IBillRequestModel): Promise<void> {
    if (!this.shop) return;
    const printed = await this.printer.print(
      buildReceipt(this.shop, { ...saved, items: bill.items }),
    );
    if (!printed) this.toasters.warn(`Bill ${saved.no} is saved. Reprint it from History`);
  }

  private loadBalance(customerId: string): void {
    this.currentBalance.set(null);
    this.customerManagementService.getCustomer(customerId).subscribe((c) => {
      if (this.customer()?.id === customerId) this.currentBalance.set(c?.balance ?? 0);
    });
  }

  private openForCustomer(customerId: string): void {
    this.customerManagementService.getCustomer(customerId).subscribe((c) => {
      if (!c) return;
      if (this.cart().length && this.customer()?.id !== c.id) this.resetBill();
      this.selectCustomer(c);
      this.clearQuery();
    });
  }

  private openDraft(id: string): void {
    this.billingService.getDraftBill(id).subscribe({
      next: ({ bill, items }) => {
        this.resetBill();
        this.draftId.set(bill.id);
        this.cart.set(
          items.map((i) => ({
            lineId: newId(),
            productId: i.productId,
            name: i.name,
            localName: i.localName,
            categoryName: i.categoryName ?? '',
            rate: i.rate,
            cost: i.cost,
            qty: i.qty,
            unit: i.unit,
            factor: i.factor,
          })),
        );
        this.billDateControl.setValue(new Date(bill.date));
        this.discountType.set(bill.discountType);
        this.discountControl.setValue(bill.discountValue || null);
        this.customerManagementService.getCustomer(bill.customerId).subscribe((c) => {
          if (c) this.selectCustomer(c);
          this.printLanguage.set(bill.printLanguage);
        });
        if (!this.isWide()) this.cartOpen.set(true);
        this.clearQuery();
      },
      error: (err) => this.toasters.error(err.message),
    });
  }

  private clearQuery(): void {
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  private updateLine(line: ICartLine, change: Partial<ICartLine>): void {
    this.pendingRemove.set(null);
    this.cart.update((cart) => cart.map((l) => (l === line ? { ...l, ...change } : l)));
  }

  private restoreDraft(): void {
    const draft = this.billingService.getDraft();
    if (!draft?.cart?.length) return;
    this.cart.set(
      draft.cart.map((l) => ({
        ...l,
        lineId: l.lineId ?? newId(),
        categoryName: l.categoryName ?? '',
      })),
    );
    this.draftId.set(draft.draftId ?? null);
    if (draft.customer) this.selectCustomer(draft.customer);
    this.billDateControl.setValue(draft.billDate ? new Date(draft.billDate) : startOfToday());
    this.discountType.set(draft.discountType);
    this.discountControl.setValue(draft.discountValue);
    this.receivedControl.setValue(draft.received);
    this.printLanguage.set(draft.printLanguage ?? BillLanguage.English);
    this.toasters.info('Your unsaved bill was restored', 'Bill restored');
  }

  private resetBill(): void {
    this.maxBillDate.set(new Date());
    this.cart.set([]);
    this.draftId.set(null);
    this.clearCustomer();
    this.billDateControl.setValue(startOfToday());
    this.discountType.set(DiscountType.Amount);
    this.discountControl.setValue(null);
    this.receivedControl.setValue(null);
    this.paymentMode.set(PaymentMode.Cash);
    this.cartOpen.set(false);
    this.billingService.clearDraft();
  }

  private createBill(): IBillRequestModel | null {
    if (!this.cart().length) {
      this.toasters.warn('Cart is empty');
      return null;
    }
    const customer = this.customer();
    if (!customer) {
      this.toasters.warn('Select a customer (Walk-in customer is in the list)');
      this.pickerOpen.set(true);
      return null;
    }
    return {
      date: customDatetime(this.billDateTime(), { get: 'UTC' }),
      customerId: customer.id,
      customerName: customer.name,
      customerMobile: customer.mobile,
      subtotal: this.subtotal(),
      discountType: this.discountType(),
      discountValue: this.discountValue() ?? 0,
      discount: this.discount(),
      total: this.total(),
      paidAmount: this.receivedNow(),
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
