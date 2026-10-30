import { Component, computed, OnInit, signal, viewChild } from '@angular/core';
import { money, ToastersService } from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { PurchaseAddEditComponent } from './purchase-add-edit/purchase-add-edit.component';
import { IPurchase, IPurchaseWithItems, PurchaseStatus } from './purchase-management.interface';
import { PurchaseManagementService } from './purchase-management.service';

interface IPurchaseGroup {
  day: string;
  label: string;
  total: number;
  purchases: IPurchase[];
}

@Component({
  selector: 'app-purchase-management',
  imports: [SideDrawerComponent, PurchaseAddEditComponent, CustomElementModule],
  templateUrl: './purchase-management.component.html',
  styleUrl: './purchase-management.component.scss',
})
export class PurchaseManagementComponent implements OnInit {
  readonly money = money;
  readonly PurchaseStatus = PurchaseStatus;
  readonly purchases = signal<IPurchase[]>([]);
  readonly searchText = signal('');
  readonly drawer = signal<'add' | 'detail' | null>(null);
  readonly detail = signal<IPurchaseWithItems | null>(null);

  readonly groups = computed<IPurchaseGroup[]>(() => {
    const query = this.searchText().trim().toLowerCase();
    const groups = new Map<string, IPurchaseGroup>();
    for (const purchase of this.purchases()) {
      if (query && !purchase.supplierName.toLowerCase().includes(query)) continue;
      const day = customDatetime(purchase.date, { get: 'day' });
      let group = groups.get(day);
      if (!group) {
        group = {
          day,
          label: customDatetime(purchase.date, { format: 'ddd, DD MMM YYYY' }),
          total: 0,
          purchases: [],
        };
        groups.set(day, group);
      }
      group.purchases.push(purchase);
      if (purchase.status !== PurchaseStatus.Cancelled) group.total += purchase.total;
    }
    return [...groups.values()];
  });

  private readonly addEdit = viewChild(PurchaseAddEditComponent);

  constructor(
    private purchaseManagementService: PurchaseManagementService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getTableData();
  }

  getTableData(): void {
    this.purchaseManagementService.getPurchaseList().subscribe({
      next: (purchases) => this.purchases.set(purchases),
      error: (err) => this.toasters.error('Could not load purchases: ' + err.message),
    });
  }

  add(): void {
    this.addEdit()?.getProducts();
    this.drawer.set('add');
  }

  open(purchase: IPurchase): void {
    this.purchaseManagementService.getPurchaseDetail(purchase.id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.drawer.set('detail');
      },
      error: (err) => this.toasters.error('Could not load purchase: ' + err.message),
    });
  }

  closeDrawer(): void {
    if (this.drawer() === 'add') this.addEdit()?.resetForm();
    this.drawer.set(null);
  }

  onSaved(): void {
    this.drawer.set(null);
    this.getTableData();
  }

  cancelPurchase(purchase: IPurchaseWithItems): void {
    if (!confirm('Cancel this purchase? Its stock will be removed.')) return;
    this.purchaseManagementService.cancelPurchase(purchase.id).subscribe({
      next: (updated) => {
        this.toasters.success('Purchase cancelled, stock removed');
        this.detail.set({ ...purchase, status: updated.status });
        this.getTableData();
      },
      error: (err) => this.toasters.error(err.message),
    });
  }
}
