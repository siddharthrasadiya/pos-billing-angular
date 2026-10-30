import { Component, computed, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ICategory, money, searchProducts, ToastersService } from 'src/app/core.index';
import { CategoryManagerComponent } from 'src/app/core/shared/category-manager/category-manager.component';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { ProductAddEditComponent } from './product-add-edit/product-add-edit.component';
import { IProduct } from './product-management.interface';
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
  ],
  templateUrl: './product-management.component.html',
})
export class ProductManagementComponent implements OnInit {
  readonly money = money;
  readonly products = signal<IProduct[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly editing = signal<IProduct | null>(null);
  readonly drawer = signal<'product' | 'categories' | null>(null);
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
          this.categoryControl.setValue(ALL_CATEGORIES);
        }
      },
      error: (err) => this.toasters.error('Could not load products: ' + err.message),
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
    this.addEdit()?.resetForm();
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
        this.toasters.success('Product deleted');
        this.getTableData();
      },
      error: (err) => this.toasters.error('Could not delete: ' + err.message),
    });
  }
}
