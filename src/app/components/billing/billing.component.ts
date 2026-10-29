import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  buildReceipt,
  IS_LOCAL,
  IShopSettings,
  money,
  PrinterService,
  ReceiptPreviewService,
  searchProducts,
  SettingsService,
  ToastersService,
} from 'src/app/core.index';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { ICategory, IProduct } from '../product-management/product-management.interface';
import { ProductManagementService } from '../product-management/product-management.service';
import { IBillRequestModel, ICartLine } from './billing.interface';
import { BillingService } from './billing.service';

const ALL_CATEGORIES = 'all';

@Component({
  selector: 'app-billing',
  imports: [NgTemplateOutlet, SideDrawerComponent],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent implements OnInit {
  readonly isLocal = IS_LOCAL;
  readonly allCategories = ALL_CATEGORIES;
  readonly money = money;
  readonly products = signal<IProduct[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly cart = signal<ICartLine[]>([]);
  readonly searchText = signal('');
  readonly categoryFilter = signal(ALL_CATEGORIES);
  readonly cartOpen = signal(false);

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
  readonly total = computed(() => this.cart().reduce((sum, l) => sum + l.qty * l.rate, 0));
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

  clearCart(): void {
    if (this.cart().length > 1 && !confirm('Remove all items from this bill?')) return;
    this.cart.set([]);
    this.cartOpen.set(false);
  }

  async webPrint(): Promise<void> {
    const bill = await this.createBill();
    if (bill && this.shop) this.preview.show(buildReceipt(this.shop, bill));
  }

  async printBill(): Promise<void> {
    const bill = await this.createBill();
    if (!bill || !this.shop) return;

    const printed = await this.printer.print(buildReceipt(this.shop, bill));
    if (!printed && !confirm('Print failed. Save the bill anyway?')) return;

    this.billingService.saveBill(bill).subscribe({
      next: () => {
        this.cart.set([]);
        this.cartOpen.set(false);
        this.getProducts();
        this.toasters.show(`Bill ${bill.no} saved`);
      },
      error: (err) => this.toasters.show('Could not save bill: ' + err.message),
    });
  }

  private async createBill(): Promise<IBillRequestModel | null> {
    if (!this.cart().length) {
      this.toasters.show('Cart is empty');
      return null;
    }
    const now = new Date();
    return {
      no: await firstValueFrom(this.billingService.getNextBillNo(now)),
      date: now.toISOString(),
      total: this.total(),
      items: this.cart(),
    };
  }
}
