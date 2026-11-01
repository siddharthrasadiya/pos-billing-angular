import { Component, computed, OnInit, signal, viewChild } from '@angular/core';
import { FormControl, FormRecord } from '@angular/forms';
import { switchMap } from 'rxjs';
import {
  DEFAULT_PURCHASE_RETENTION_DAYS,
  money,
  SettingsService,
  ToastersService,
  SecurityService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import customDatetime from 'src/app/core/shared/custom-elements/custom-datetime.pipe';
import { SideDrawerComponent } from 'src/app/core/shared/side-drawer/side-drawer.component';
import { PurchaseAddEditComponent } from './purchase-add-edit/purchase-add-edit.component';
import {
  IPurchase,
  IPurchaseWithItems,
  PURCHASE_STATUS_LABELS,
  PurchaseStatus,
} from './purchase-management.interface';
import {
  daysUntilAutoDelete,
  deleteWarningDays,
  PurchaseManagementService,
} from './purchase-management.service';

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
  readonly statusLabels = PURCHASE_STATUS_LABELS;
  readonly purchases = signal<IPurchase[]>([]);
  readonly searchText = signal('');
  readonly drawer = signal<'form' | 'detail' | 'receive' | null>(null);
  readonly detail = signal<IPurchaseWithItems | null>(null);
  readonly editing = signal<IPurchaseWithItems | null>(null);
  readonly retentionDays = signal(DEFAULT_PURCHASE_RETENTION_DAYS);
  readonly receiveForm = new FormRecord<FormControl<number | null>>({});

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
          label: customDatetime(purchase.date, { get: 'date' }),
          total: 0,
          purchases: [],
        };
        groups.set(day, group);
      }
      group.purchases.push(purchase);
      if (purchase.status === PurchaseStatus.Received) group.total += purchase.receivedTotal;
    }
    return [...groups.values()];
  });

  private readonly addEdit = viewChild(PurchaseAddEditComponent);

  constructor(
    private purchaseManagementService: PurchaseManagementService,
    private settingsService: SettingsService,
    private security: SecurityService,
    private toasters: ToastersService,
  ) {}

  ngOnInit(): void {
    this.getTableData();
  }

  // Expired received/cancelled purchases are removed first, then the list is loaded
  getTableData(): void {
    this.settingsService
      .getShopSettings()
      .pipe(
        switchMap((shop) => {
          this.retentionDays.set(shop.purchaseRetentionDays);
          return this.purchaseManagementService.deleteExpiredPurchases(shop.purchaseRetentionDays);
        }),
        switchMap(() => this.purchaseManagementService.getPurchaseList()),
      )
      .subscribe({
        next: (purchases) => this.purchases.set(purchases),
        error: (err) => this.toasters.error('Could not load purchases: ' + err.message),
      });
  }

  // Days left before auto-delete, shown only inside the warning window
  deleteWarning(purchase: IPurchase): number | null {
    const days = daysUntilAutoDelete(purchase, this.retentionDays());
    return days !== null && days <= deleteWarningDays(this.retentionDays()) ? days : null;
  }

  isShort(purchase: IPurchaseWithItems): boolean {
    return purchase.items.some((i) => i.receivedQty !== null && i.receivedQty < i.qty);
  }

  async add(): Promise<void> {
    if (!(await this.security.allow('add a purchase'))) return;
    this.editing.set(null);
    this.addEdit()?.getProducts();
    this.drawer.set('form');
  }

  async edit(purchase: IPurchaseWithItems): Promise<void> {
    if (!(await this.security.allow('edit this order'))) return;
    this.editing.set(purchase);
    this.addEdit()?.getProducts();
    this.drawer.set('form');
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

  async startReceive(purchase: IPurchaseWithItems): Promise<void> {
    if (!(await this.security.allow('receive goods'))) return;
    for (const key of Object.keys(this.receiveForm.controls)) this.receiveForm.removeControl(key);
    for (const item of purchase.items) {
      this.receiveForm.addControl(item.id, new FormControl<number | null>(item.qty));
    }
    this.drawer.set('receive');
  }

  confirmReceive(purchase: IPurchaseWithItems): void {
    const received: Record<string, number> = {};
    for (const item of purchase.items) {
      const qty = this.receiveForm.controls[item.id]?.value ?? 0;
      if (qty < 0 || qty > item.qty) {
        this.toasters.warn(`${item.name}: received must be between 0 and ${item.qty}`);
        return;
      }
      received[item.id] = qty;
    }
    if (!Object.values(received).some((qty) => qty > 0)) {
      this.toasters.warn('Nothing received. Cancel the order instead.');
      return;
    }
    this.purchaseManagementService.receivePurchase(purchase.id, received).subscribe({
      next: () => {
        this.toasters.success('Purchase received, stock added');
        this.open(purchase);
        this.getTableData();
      },
      error: (err) => this.toasters.error('Could not receive: ' + err.message),
    });
  }

  closeDrawer(): void {
    if (this.drawer() === 'form') this.addEdit()?.resetForm();
    this.drawer.set(null);
    this.editing.set(null);
  }

  onSaved(purchase: IPurchase): void {
    this.editing.set(null);
    this.getTableData();
    this.open(purchase);
  }

  async cancelPurchase(purchase: IPurchaseWithItems): Promise<void> {
    if (!(await this.security.allow('cancel this purchase'))) return;
    const message =
      purchase.status === PurchaseStatus.Ordered
        ? 'Cancel this order?'
        : 'Cancel this purchase? Its stock will be removed.';
    if (!confirm(message)) return;
    this.purchaseManagementService.cancelPurchase(purchase.id).subscribe({
      next: () => {
        this.toasters.success('Purchase cancelled');
        this.open(purchase);
        this.getTableData();
      },
      error: (err) => this.toasters.error(err.message),
    });
  }

  async deletePurchase(purchase: IPurchaseWithItems): Promise<void> {
    if (!(await this.security.allow('delete this purchase'))) return;
    const message =
      purchase.status === PurchaseStatus.Received
        ? 'Delete this purchase record? Stock that came in with it stays in stock.'
        : 'Delete this purchase?';
    if (!confirm(message)) return;
    this.purchaseManagementService.deletePurchase(purchase.id).subscribe({
      next: () => {
        this.toasters.success('Purchase deleted');
        this.closeDrawer();
        this.getTableData();
      },
      error: (err) => this.toasters.error('Could not delete: ' + err.message),
    });
  }
}
