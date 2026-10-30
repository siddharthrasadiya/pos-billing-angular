import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { FloatLabelModule } from 'primeng/floatlabel';
import { fieldErrorText, newFieldId } from '../custom-field.helper';

// Works with local Date objects; convert to UTC ISO with customDatetime(date, { get: 'UTC' }) before saving
@Component({
  selector: 'custom-date',
  templateUrl: './custom-date.component.html',
  imports: [ReactiveFormsModule, FloatLabelModule, DatePickerModule],
})
export class CustomDateComponent {
  @Input() label: string = '';
  @Input() formControlRef: FormControl<Date | null> = new FormControl<Date | null>(null);
  @Input() minDate: Date | null = null;
  @Input() maxDate: Date | null = null;
  @Input() showTime: boolean = false;
  @Input() showClear: boolean = false;
  @Input() dateFormat: string = 'dd M yy';
  @Input() view: 'date' | 'month' = 'date';
  @Output() dateChange: EventEmitter<Date | null> = new EventEmitter();

  readonly id = newFieldId();
  isControlRequired = Validators.required;

  get errorText(): string {
    return fieldErrorText(this.formControlRef, this.label);
  }
}
