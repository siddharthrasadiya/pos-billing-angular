import { Component, effect, input, output } from '@angular/core';
import { FormControl } from '@angular/forms';
import { CustomElementModule } from '../custom-elements/custom-elements.module';
import { IconComponent } from '../icon/icon.component';

export function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// One month at a time, so screens never load years of bills at once
@Component({
  selector: 'app-month-picker',
  imports: [CustomElementModule, IconComponent],
  templateUrl: './month-picker.component.html',
  styleUrl: './month-picker.component.scss',
})
export class MonthPickerComponent {
  readonly month = input.required<Date>();
  readonly monthChange = output<Date>();

  readonly thisMonth = monthStart(new Date());
  readonly control = new FormControl<Date | null>(this.thisMonth);

  constructor() {
    effect(() => this.control.setValue(this.month()));
  }

  get isThisMonth(): boolean {
    return this.month().getTime() >= this.thisMonth.getTime();
  }

  select(date: Date | null): void {
    if (!date) {
      this.control.setValue(this.month());
      return;
    }
    this.monthChange.emit(monthStart(date));
  }

  shift(by: number): void {
    const month = this.month();
    this.monthChange.emit(new Date(month.getFullYear(), month.getMonth() + by, 1));
  }
}
