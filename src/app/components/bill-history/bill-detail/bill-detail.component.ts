import { Component, computed, effect, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  BILL_LANGUAGE_OPTIONS,
  BILL_STATUS_LABELS,
  BillLanguage,
  BillStatus,
  buildReceipt,
  buildShareText,
  canvasToPdf,
  formatMobile,
  IShopSettings,
  money,
  PrinterService,
  ReceiptPreviewService,
  receiptToCanvas,
  roundMoney,
  ShareService,
  ToastersService,
  SecurityService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { IconComponent } from 'src/app/core/shared/icon/icon.component';
import { IBillWithItems } from '../../billing/billing.interface';
import { BillingService } from '../../billing/billing.service';
import { BillHistoryService } from '../bill-history.service';

@Component({
  selector: 'app-bill-detail',
  imports: [CustomElementModule, IconComponent],
  templateUrl: './bill-detail.component.html',
  styleUrl: './bill-detail.component.scss',
})
export class BillDetailComponent {
  readonly billId = input<string | null>(null);
  readonly shop = input<IShopSettings | undefined>(undefined);
  readonly changed = output<void>();
  readonly money = money;
  readonly formatMobile = formatMobile;
  readonly statusLabels = BILL_STATUS_LABELS;
  readonly languageOptions = BILL_LANGUAGE_OPTIONS;
  readonly printLanguage = signal(BillLanguage.English);
  readonly BillStatus = BillStatus;
  readonly bill = signal<IBillWithItems | null>(null);
  readonly menu = signal<'share' | 'more' | null>(null);
  readonly sharing = signal(false);
  readonly abs = Math.abs;
  // Account as it stood when the bill was issued (drafts have none)
  readonly account = computed(() => {
    const bill = this.bill();
    if (!bill || bill.previousBalance === undefined || bill.balanceAfter === undefined) return null;
    return { previous: bill.previousBalance, after: bill.balanceAfter };
  });
  constructor(
    private billHistoryService: BillHistoryService,
    private billingService: BillingService,
    private router: Router,
    private printer: PrinterService,
    private preview: ReceiptPreviewService,
    private share: ShareService,
    private security: SecurityService,
    private toasters: ToastersService,
  ) {
    effect(() => {
      const id = this.billId();
      this.menu.set(null);
      if (id) this.load(id);
    });
  }

  toggleMenu(menu: 'share' | 'more'): void {
    this.menu.set(this.menu() === menu ? null : menu);
  }

  load(id: string): void {
    this.billHistoryService.getBillDetail(id).subscribe({
      next: (bill) => {
        this.bill.set(bill);
        this.printLanguage.set(bill.printLanguage ?? BillLanguage.English);
      },
      error: (err) => this.toasters.error('Could not load bill: ' + err.message),
    });
  }

  // Opens the draft on the Bill screen, where it can be changed and issued
  editDraft(): void {
    const bill = this.bill();
    if (bill) this.router.navigate(['/billing'], { queryParams: { draft: bill.id } });
  }

  async deleteDraft(): Promise<void> {
    if (!(await this.security.allow('delete this draft'))) return;
    const bill = this.bill();
    if (!bill || !confirm('Delete this draft? Nothing else changes.')) return;
    this.billingService.deleteDraftBill(bill.id).subscribe({
      next: () => {
        this.toasters.success('Draft deleted');
        this.bill.set(null);
        this.changed.emit();
      },
      error: (err) => this.toasters.error('Could not delete: ' + err.message),
    });
  }

  async cancelBill(): Promise<void> {
    if (!(await this.security.allow('cancel this bill'))) return;
    const bill = this.bill();
    if (!bill) return;
    const message = `Cancel bill ${bill.no}? Items go back to stock and ${money(bill.total)} comes off the customer's account. This cannot be undone.`;
    if (!confirm(message)) return;
    this.billHistoryService.cancelBill(bill.id).subscribe({
      next: () => {
        this.toasters.success('Bill cancelled');
        this.load(bill.id);
        this.changed.emit();
      },
      error: (err) => this.toasters.error('Could not cancel: ' + err.message),
    });
  }

  view(): void {
    const receipt = this.receipt();
    this.menu.set(null);
    if (receipt) this.preview.show(receipt);
  }

  reprint(): void {
    const receipt = this.receipt();
    if (receipt) this.printer.print(receipt);
  }

  shareOnWhatsApp(): void {
    const text = this.shareText();
    const mobile = this.bill()?.customerMobile;
    this.menu.set(null);
    if (text && mobile) this.share.openWhatsApp(mobile, text);
  }

  async shareAsText(): Promise<void> {
    const text = this.shareText();
    this.menu.set(null);
    if (text) await this.share.shareText('Bill ' + this.bill()!.no, text);
  }

  async shareAsPdf(): Promise<void> {
    const receipt = this.receipt();
    const bill = this.bill();
    if (!receipt || !bill || this.sharing()) return;
    this.sharing.set(true);
    try {
      const pdf = await canvasToPdf(receiptToCanvas(receipt));
      const file = new File([pdf], `Bill-${bill.no.replace(/\//g, '-')}.pdf`, {
        type: 'application/pdf',
      });
      this.menu.set(null);
      await this.share.shareFile(file, 'Bill ' + bill.no);
    } catch (err) {
      this.toasters.error('Could not create PDF: ' + (err as Error).message);
    } finally {
      this.sharing.set(false);
    }
  }

  private receipt(): string | null {
    const bill = this.bill();
    const shop = this.shop();
    return bill && shop
      ? buildReceipt(shop, { ...bill, printLanguage: this.printLanguage() })
      : null;
  }

  private shareText(): string | null {
    const bill = this.bill();
    const shop = this.shop();
    return bill && shop
      ? buildShareText(shop, { ...bill, printLanguage: this.printLanguage() })
      : null;
  }
}
