import { Component, computed, effect, input, output, signal } from '@angular/core';
import {
  BILL_STATUS_LABELS,
  BillStatus,
  buildReceipt,
  formatDate,
  IS_LOCAL,
  IShopSettings,
  money,
  PrinterService,
  ReceiptPreviewService,
  ToastersService,
} from 'src/app/core.index';
import { IBillWithItems } from '../../billing/billing.interface';
import { BillHistoryService } from '../bill-history.service';

@Component({
  selector: 'app-bill-detail',
  templateUrl: './bill-detail.component.html',
  styleUrl: './bill-detail.component.scss',
})
export class BillDetailComponent {
  readonly billId = input<string | null>(null);
  readonly shop = input<IShopSettings | undefined>(undefined);
  readonly changed = output<void>();
  readonly isLocal = IS_LOCAL;
  readonly money = money;
  readonly statusLabels = BILL_STATUS_LABELS;
  readonly BillStatus = BillStatus;
  readonly bill = signal<IBillWithItems | null>(null);
  readonly paymentInput = signal(0);
  readonly balance = computed(() => {
    const bill = this.bill();
    return bill ? bill.total - bill.paidAmount : 0;
  });
  readonly profit = computed(() => {
    const bill = this.bill();
    return bill ? bill.total - bill.costTotal : 0;
  });

  constructor(
    private billHistoryService: BillHistoryService,
    private printer: PrinterService,
    private preview: ReceiptPreviewService,
    private toasters: ToastersService,
  ) {
    effect(() => {
      const id = this.billId();
      this.paymentInput.set(0);
      if (id) this.load(id);
    });
  }

  dateText(date: string): string {
    return formatDate(new Date(date));
  }

  load(id: string): void {
    this.billHistoryService.getBillDetail(id).subscribe({
      next: (bill) => this.bill.set(bill),
      error: (err) => this.toasters.show('Could not load bill: ' + err.message),
    });
  }

  setPaymentInput(target: EventTarget | null): void {
    const value = Number((target as HTMLInputElement).value);
    this.paymentInput.set(Number.isFinite(value) && value > 0 ? value : 0);
  }

  recordPayment(amount: number): void {
    const bill = this.bill();
    if (!bill || amount <= 0) {
      this.toasters.show('Enter amount received');
      return;
    }
    if (amount > this.balance()) {
      this.toasters.show(`Amount is more than due ${money(this.balance())}`);
      return;
    }
    this.billHistoryService.recordPayment(bill.id, amount).subscribe({
      next: () => {
        this.toasters.show('Payment saved');
        this.paymentInput.set(0);
        this.load(bill.id);
        this.changed.emit();
      },
      error: (err) => this.toasters.show('Could not save payment: ' + err.message),
    });
  }

  cancelBill(): void {
    const bill = this.bill();
    if (!bill) return;
    if (!confirm(`Cancel bill ${bill.no}? Items go back to stock. This cannot be undone.`)) return;
    this.billHistoryService.cancelBill(bill.id).subscribe({
      next: () => {
        this.toasters.show('Bill cancelled');
        this.load(bill.id);
        this.changed.emit();
      },
      error: (err) => this.toasters.show('Could not cancel: ' + err.message),
    });
  }

  view(): void {
    const bill = this.bill();
    const shop = this.shop();
    if (bill && shop) this.preview.show(buildReceipt(shop, bill));
  }

  reprint(): void {
    const bill = this.bill();
    const shop = this.shop();
    if (bill && shop) this.printer.print(buildReceipt(shop, bill));
  }
}
