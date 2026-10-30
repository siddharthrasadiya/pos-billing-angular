import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { fieldErrorText, newFieldId } from '../custom-field.helper';

@Component({
  selector: 'custom-number-input',
  templateUrl: './custom-number-input.component.html',
  imports: [ReactiveFormsModule, FloatLabelModule, InputNumberModule],
})
export class CustomNumberInputComponent {
  @Input() label: string = '';
  @Input() formControlRef: FormControl = new FormControl(null);
  @Input() maxFractionDigits: number = 2;
  @Input() min: number | null = 0;
  @Input() max: number | null = null;
  @Input() prefix: string = '';
  @Input() suffix: string = '';
  @Input() errorMessage: string = '';
  @Output() valueChange: EventEmitter<number | null> = new EventEmitter();

  readonly id = newFieldId();
  isControlRequired = Validators.required;

  get errorText(): string {
    return fieldErrorText(this.formControlRef, this.label, this.errorMessage);
  }
}
