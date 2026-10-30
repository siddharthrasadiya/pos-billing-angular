import { Component, computed, OnInit, output, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { formatMobile, ICategory, ToastersService } from 'src/app/core.index';
import { CustomerAddEditComponent } from '../../customer-management/customer-add-edit/customer-add-edit.component';
import { ICustomer } from '../../customer-management/customer-management.interface';
import {
  CustomerManagementService,
  searchCustomers,
} from '../../customer-management/customer-management.service';

const ALL_CATEGORIES = 'all';

@Component({
  selector: 'app-customer-picker',
  imports: [CustomerAddEditComponent],
  templateUrl: './customer-picker.component.html',
  styleUrl: './customer-picker.component.scss',
})
export class CustomerPickerComponent implements OnInit {
  readonly selected = output<ICustomer>();
  readonly formatMobile = formatMobile;
  readonly allCategories = ALL_CATEGORIES;
  readonly customers = signal<ICustomer[]>([]);
  readonly categories = signal<ICategory[]>([]);
  readonly searchText = signal('');
  readonly categoryFilter = signal(ALL_CATEGORIES);
  readonly adding = signal(false);

  readonly usedCategories = computed(() =>
    this.categories()
      .filter((c) => this.customers().some((cu) => cu.categoryId === c.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly results = computed(() => {
    const filter = this.categoryFilter();
    const inFilter = this.customers().filter(
      (c) => filter === ALL_CATEGORIES || c.categoryId === filter,
    );
    return searchCustomers(inFilter, this.categories(), this.searchText());
  });

  constructor(
    private customerManagementService: CustomerManagementService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getCustomers();
  }

  getCustomers(): void {
    forkJoin({
      customers: this.customerManagementService.getCustomerList(),
      categories: this.customerManagementService.getCategoryList(),
    }).subscribe({
      next: ({ customers, categories }) => {
        this.customers.set(customers);
        this.categories.set(categories);
      },
      error: (err) => this.toasters.error('Could not load customers: ' + err.message),
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }

  choose(customer: ICustomer): void {
    this.selected.emit(customer);
    this.searchText.set('');
  }

  onAdded(customer: ICustomer): void {
    this.adding.set(false);
    this.getCustomers();
    this.choose(customer);
  }
}
