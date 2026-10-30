import { Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TextareaModule } from 'primeng/textarea';
import { fieldErrorText, newFieldId } from '../custom-field.helper';

@Component({
  selector: 'custom-textarea',
  templateUrl: './custom-textarea.component.html',
  imports: [ReactiveFormsModule, FloatLabelModule, TextareaModule],
})
export class CustomTextareaComponent {
  @Input() label: string = '';
  @Input() formControlRef: FormControl = new FormControl(null);
  @Input() rows: number = 2;
  @Input() maxlength: number | null = null;

  readonly id = newFieldId();
  isControlRequired = Validators.required;

  get errorText(): string {
    return fieldErrorText(this.formControlRef, this.label);
  }

  checkTrim(): void {
    if (typeof this.formControlRef.value === 'string') {
      this.formControlRef.setValue(this.formControlRef.value.trim(), { emitEvent: false });
    }
  }
}
