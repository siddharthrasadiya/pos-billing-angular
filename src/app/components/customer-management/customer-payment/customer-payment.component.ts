import { Component, computed, effect, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, Validators } from '@angular/forms';
import {
  balanceLabel,
  LedgerType,
  MAX_AMOUNT,
  money,
  PAYMENT_MODE_OPTIONS,
  PaymentMode,
  roundMoney,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { ICustomer } from '../customer-management.interface';
import { CustomerManagementService } from '../customer-management.service';

export type PaymentDirection = LedgerType.PaymentIn | LedgerType.PaymentOut;

// Receive money from a customer, or give money back (refund, return of advance, or undoing a
// wrong entry). Each save is one statement entry; nothing here is tied to a bill
@Component({
  selector: 'app-customer-payment',
  imports: [CustomElementModule],
  templateUrl: './customer-payment.component.html',
  styleUrl: './customer-payment.component.scss',
})
export class CustomerPaymentComponent {
  readonly customer = input<ICustomer | null>(null);
  readonly direction = input<PaymentDirection>(LedgerType.PaymentIn);
  readonly saved = output<void>();

  readonly money = money;
  readonly balanceLabel = balanceLabel;
  readonly LedgerType = LedgerType;
  readonly modes = PAYMENT_MODE_OPTIONS;
  readonly mode = signal(PaymentMode.Cash);
  readonly saving = signal(false);
  readonly amountControl = new FormControl<number | null>(null, [Validators.required]);
  readonly remarkControl = new FormControl('', { nonNullable: true });
  private readonly amount = toSignal(this.amountControl.valueChanges, { initialValue: null });

  readonly balanceAfter = computed(() => {
    const balance = this.customer()?.balance ?? 0;
    const amount = roundMoney(this.amount() ?? 0);
    return roundMoney(
      this.direction() === LedgerType.PaymentIn ? balance - amount : balance + amount,
    );
  });
  readonly maxAmount = MAX_AMOUNT;

  constructor(
    private customerManagementService: CustomerManagementService,
    private toasters: ToastersService,
  ) {
    effect(() => {
      this.customer();
      this.direction();
      this.amountControl.reset(null);
      this.remarkControl.reset('');
      this.mode.set(PaymentMode.Cash);
    });
  }

  save(): void {
    const customer = this.customer();
    const amount = roundMoney(this.amountControl.value ?? 0);
    if (!customer || this.saving()) return;
    if (!(amount > 0)) {
      this.amountControl.markAsTouched();
      this.toasters.warn('Enter an amount more than 0');
      return;
    }
    this.saving.set(true);
    this.customerManagementService
      .recordPayment(customer.id, this.direction(), amount, this.mode(), this.remarkControl.value)
      .subscribe({
        next: (entry) => {
          this.saving.set(false);
          this.toasters.success(`${entry.no} saved. ${balanceLabel(entry.balanceAfter)}`);
          this.saved.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.toasters.error('Could not save: ' + err.message);
        },
      });
  }
}
