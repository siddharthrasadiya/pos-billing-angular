import { Component, effect, input, signal, untracked } from '@angular/core';
import {
  balanceLabel,
  DEBIT_TYPES,
  ILedgerEntry,
  LEDGER_TYPE_LABELS,
  money,
  ToastersService,
} from 'src/app/core.index';
import { CustomElementModule } from 'src/app/core/shared/custom-elements/custom-elements.module';
import { ICustomer } from '../customer-management.interface';
import { CustomerManagementService, IStatement } from '../customer-management.service';

// Account statement: the due now, then every kept bill, payment and refund (newest first) with
// the balance after it. Dr (red) raises what the customer owes, Cr (green) lowers it
@Component({
  selector: 'app-customer-statement',
  imports: [CustomElementModule],
  templateUrl: './customer-statement.component.html',
  styleUrl: './customer-statement.component.scss',
})
export class CustomerStatementComponent {
  readonly customer = input<ICustomer | null>(null);

  readonly money = money;
  readonly abs = Math.abs;
  readonly balanceLabel = balanceLabel;
  readonly typeLabels = LEDGER_TYPE_LABELS;
  readonly statement = signal<IStatement | null>(null);

  constructor(
    private customerManagementService: CustomerManagementService,
    private toasters: ToastersService,
  ) {
    effect(() => {
      const customer = this.customer();
      if (customer) untracked(() => this.getTableData(customer.id));
    });
  }

  isDebit(entry: ILedgerEntry): boolean {
    return DEBIT_TYPES.has(entry.type);
  }

  private getTableData(customerId: string): void {
    this.customerManagementService.getStatement(customerId).subscribe({
      next: (statement) => this.statement.set(statement),
      error: (err) => this.toasters.error('Could not load statement: ' + err.message),
    });
  }
}
