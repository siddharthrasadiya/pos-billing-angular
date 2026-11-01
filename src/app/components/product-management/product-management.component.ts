import { Component, computed, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  formatStock,
  ICategory,
  isLowStock,
  mainUnit,
  money,
  roundMoney,
  searchProducts,
  ToastersService,
  unitFactor,
  SecurityService,
} from 'src/app/core.index';
import { CategoryManagerComponent } from 'src/app/core/shared/category-manager/category-manager.component';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { ProductAddEditComponent } from './product-add-edit/product-add-edit.component';
import { IProduct, IStockValuation } from './product-management.interface';
import { ProductStockComponent } from './product-stock/product-stock.component';
import { ProductManagementService } from './product-management.service';

const ALL_CATEGORIES = 'all';

@Component({
  selector: 'app-product-management',
  imports: [
    SideDrawerComponent,
    ProductAddEditComponent,
    CategoryManagerComponent,
    IconComponent,
    CustomElementModule,
    ProductStockComponent,
  ],
  templateUrl: './product-management.component.html',
  styleUrl: './product-management.component.scss',
})
export class ProductManagementComponent implements OnInit {
  readonly money = money;
  readonly formatStock = formatStock;
  readonly mainUnit = mainUnit;
  readonly lastCost = (p: IProduct) => roundMoney(p.buyPrice * unitFactor(p));
  readonly isLowStock = isLowStock;
  readonly onlyLow = signal(false);
  readonly lowCount = computed(() => this.products().filter(isLowStock).length);
  readonly products = signal<IProduct[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly editing = signal<IProduct | null>(null);
  readonly drawer = signal<'product' | 'categories' | 'stock' | null>(null);
  readonly stockProduct = signal<IProduct | null>(null);
  readonly valuation = signal<IStockValuation | null>(null);
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
  readonly tableData = computed(() => {
    const filter = this.categoryFilter();
    const onlyLow = this.onlyLow();
    const inFilter = this.products().filter(
      (p) => (filter === ALL_CATEGORIES || p.categoryId === filter) && (!onlyLow || isLowStock(p)),
    );
    const found = searchProducts(inFilter, this.searchText());
    // Lowest stock first, so the most urgent reorders are on top
    return onlyLow
      ? [...found].sort((a, b) => a.stock / unitFactor(a) - b.stock / unitFactor(b))
      : found;
  });

  readonly productCount = (category: ICategory) =>
    this.products().filter((p) => p.categoryId === category.id).length;
  private readonly addEdit = viewChild(ProductAddEditComponent);

  constructor(
    protected productManagementService: ProductManagementService,
    private security: SecurityService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getTableData();
  }

  getTableData(): void {
    forkJoin({
      products: this.productManagementService.getProductList(),
      categories: this.productManagementService.getCategoryList(),
      valuation: this.productManagementService.getStockValuation(),
    }).subscribe({
      next: ({ products, categories, valuation }) => {
        this.products.set(products);
        this.categories.set(categories);
        this.valuation.set(valuation);
        const stockProduct = this.stockProduct();
        if (stockProduct) {
          this.stockProduct.set(products.find((p) => p.id === stockProduct.id) ?? null);
        }
        if (
          this.categoryFilter() !== ALL_CATEGORIES &&
          this.categoryFilter() !== '' &&
          !categories.some((c) => c.id === this.categoryFilter())
        ) {
          this.categoryControl.setValue(ALL_CATEGORIES);
        }
      },
      error: (err) => this.toasters.error('Could not load products: ' + err.message),
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? 'No category';
  }

  async add(): Promise<void> {
    if (!(await this.security.allow('add a product'))) return;
    this.editing.set(null);
    this.drawer.set('product');
  }

  async openCategories(): Promise<void> {
    if (await this.security.allow('change categories')) this.drawer.set('categories');
  }

  async edit(product: IProduct): Promise<void> {
    if (!(await this.security.allow('edit this product'))) return;
    this.editing.set(product);
    this.drawer.set('product');
  }

  openStock(product: IProduct): void {
    this.stockProduct.set(product);
    this.drawer.set('stock');
  }

  stockValue(product: IProduct): number {
    return this.valuation()?.byProduct[product.id] ?? 0;
  }

  closeDrawer(): void {
    this.stockProduct.set(null);
    this.drawer.set(null);
    this.editing.set(null);
    this.addEdit()?.resetForm();
  }

  onSaved(): void {
    this.closeDrawer();
    this.getTableData();
  }

  async delete(product: IProduct): Promise<void> {
    if (!(await this.security.allow('delete this product'))) return;
    if (!confirm(`Delete "${product.name}"?`)) return;
    this.productManagementService.deleteProduct(product.id).subscribe({
      next: () => {
        if (this.editing()?.id === product.id) this.editing.set(null);
        this.toasters.success('Product deleted');
        this.getTableData();
      },
      error: (err) => this.toasters.error('Could not delete: ' + err.message),
    });
  }
}
