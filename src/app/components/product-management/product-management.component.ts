import { Component, computed, OnInit, signal, viewChild } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ICategory, money, searchProducts, ToastersService } from 'src/app/core.index';
import { CategoryManagerComponent } from 'src/app/core/shared/category-manager/category-manager.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { ProductAddEditComponent } from './product-add-edit/product-add-edit.component';
import { IProduct } from './product-management.interface';
import { ProductManagementService } from './product-management.service';

const ALL_CATEGORIES = 'all';

@Component({
  selector: 'app-product-management',
  imports: [SideDrawerComponent, ProductAddEditComponent, CategoryManagerComponent],
  templateUrl: './product-management.component.html',
})
export class ProductManagementComponent implements OnInit {
  readonly money = money;
  readonly products = signal<IProduct[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly editing = signal<IProduct | null>(null);
  readonly drawer = signal<'product' | 'categories' | null>(null);
  readonly searchText = signal('');
  readonly categoryFilter = signal(ALL_CATEGORIES);

  readonly sortedCategories = computed(() =>
    [...this.categories()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly tableData = computed(() => {
    const filter = this.categoryFilter();
    const inFilter = this.products().filter(
      (p) => filter === ALL_CATEGORIES || p.categoryId === filter,
    );
    return searchProducts(inFilter, this.searchText());
  });

  readonly productCount = (category: ICategory) =>
    this.products().filter((p) => p.categoryId === category.id).length;
  private readonly addEdit = viewChild(ProductAddEditComponent);

  constructor(
    protected productManagementService: ProductManagementService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getTableData();
  }

  getTableData(): void {
    forkJoin({
      products: this.productManagementService.getProductList(),
      categories: this.productManagementService.getCategoryList(),
    }).subscribe({
      next: ({ products, categories }) => {
        this.products.set(products);
        this.categories.set(categories);
        if (
          this.categoryFilter() !== ALL_CATEGORIES &&
          this.categoryFilter() !== '' &&
          !categories.some((c) => c.id === this.categoryFilter())
        ) {
          this.categoryFilter.set(ALL_CATEGORIES);
        }
      },
      error: (err) => this.toasters.show('Could not load products: ' + err.message),
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? 'No category';
  }

  add(): void {
    this.editing.set(null);
    this.drawer.set('product');
  }

  edit(product: IProduct): void {
    this.editing.set(product);
    this.drawer.set('product');
  }

  closeDrawer(): void {
    this.drawer.set(null);
    this.editing.set(null);
    this.addEdit()?.form.reset();
  }

  onSaved(): void {
    this.closeDrawer();
    this.getTableData();
  }

  delete(product: IProduct): void {
    if (!confirm(`Delete "${product.name}"?`)) return;
    this.productManagementService.deleteProduct(product.id).subscribe({
      next: () => {
        if (this.editing()?.id === product.id) this.editing.set(null);
        this.toasters.show('Product deleted');
        this.getTableData();
      },
      error: (err) => this.toasters.show('Could not delete: ' + err.message),
    });
  }
}
