import { Component, computed, OnInit, signal, viewChild } from '@angular/core';
import { forkJoin } from 'rxjs';
import { formatMobile, ICategory, ToastersService } from 'src/app/core.index';
import { CategoryManagerComponent } from 'src/app/core/shared/category-manager/category-manager.component';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { CustomerAddEditComponent } from './customer-add-edit/customer-add-edit.component';
import { ICustomer } from './customer-management.interface';
import { CustomerManagementService, searchCustomers } from './customer-management.service';

const ALL_CATEGORIES = 'all';

@Component({
  selector: 'app-customer-management',
  imports: [SideDrawerComponent, CustomerAddEditComponent, CategoryManagerComponent],
  templateUrl: './customer-management.component.html',
})
export class CustomerManagementComponent implements OnInit {
  readonly formatMobile = formatMobile;
  readonly customers = signal<ICustomer[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly editing = signal<ICustomer | null>(null);
  readonly drawer = signal<'customer' | 'categories' | null>(null);
  readonly searchText = signal('');
  readonly categoryFilter = signal(ALL_CATEGORIES);

  readonly sortedCategories = computed(() =>
    [...this.categories()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly tableData = computed(() => {
    const filter = this.categoryFilter();
    const inFilter = this.customers().filter(
      (c) => filter === ALL_CATEGORIES || c.categoryId === filter,
    );
    return searchCustomers(inFilter, this.categories(), this.searchText());
  });

  readonly customerCount = (category: ICategory) =>
    this.customers().filter((c) => c.categoryId === category.id).length;
  private readonly addEdit = viewChild(CustomerAddEditComponent);

  constructor(
    protected customerManagementService: CustomerManagementService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getTableData();
  }

  getTableData(): void {
    forkJoin({
      customers: this.customerManagementService.getCustomerList(),
      categories: this.customerManagementService.getCategoryList(),
    }).subscribe({
      next: ({ customers, categories }) => {
        this.customers.set(customers);
        this.categories.set(categories);
        const filter = this.categoryFilter();
        if (filter !== ALL_CATEGORIES && filter !== '' && !categories.some((c) => c.id === filter)) {
          this.categoryFilter.set(ALL_CATEGORIES);
        }
      },
      error: (err) => this.toasters.error('Could not load customers: ' + err.message),
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? 'No category';
  }

  add(): void {
    this.editing.set(null);
    this.drawer.set('customer');
  }

  edit(customer: ICustomer): void {
    this.editing.set(customer);
    this.drawer.set('customer');
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

  delete(customer: ICustomer): void {
    if (!confirm(`Delete "${customer.name}"? Old bills keep the customer name.`)) return;
    this.customerManagementService.deleteCustomer(customer.id).subscribe({
      next: () => {
        this.toasters.success('Customer deleted');
        this.getTableData();
      },
      error: (err) => this.toasters.error('Could not delete: ' + err.message),
    });
  }
}
