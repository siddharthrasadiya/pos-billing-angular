import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { fieldErrorText, newFieldId } from '../custom-field.helper';

@Component({
  selector: 'custom-input',
  templateUrl: './custom-input.component.html',
  imports: [ReactiveFormsModule, FloatLabelModule, InputTextModule],
})
export class CustomInputComponent {
  @Input() label: string = '';
  @Input() formControlRef: FormControl = new FormControl(null);
  @Input() type: 'text' | 'email' | 'tel' | 'search' = 'text';
  @Input() maxlength: number | null = null;
  @Input() inputmode: string | null = null;
  @Input() placeholder: string = '';
  @Input() errorMessage: string = '';
  @Input() isAutoTrim: boolean = true;
  @Input() isUpperCase: boolean = false;
  @Output() blurEvent: EventEmitter<void> = new EventEmitter();
  @Output() inputEvent: EventEmitter<string> = new EventEmitter();

  readonly id = newFieldId();
  isControlRequired = Validators.required;

  get errorText(): string {
    return fieldErrorText(this.formControlRef, this.label, this.errorMessage);
  }

  onInput(value: string): void {
    if (this.isUpperCase && value !== value.toUpperCase()) {
      this.formControlRef.setValue(value.toUpperCase());
    }
    this.inputEvent.emit(this.formControlRef.value);
  }

  checkTrim(): void {
    this.blurEvent.emit();
    if (this.isAutoTrim && typeof this.formControlRef.value === 'string') {
      this.formControlRef.setValue(this.formControlRef.value.trim(), { emitEvent: false });
    }
  }
}
