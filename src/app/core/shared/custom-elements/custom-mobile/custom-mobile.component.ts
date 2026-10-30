import { Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { formatMobile } from 'src/app/core/helpers/mobile.helper';
import { fieldErrorText, newFieldId } from '../custom-field.helper';

// Shows 12345-67890 while typing; pair the control with Validators.pattern(MOBILE_PATTERN)
@Component({
  selector: 'custom-mobile',
  templateUrl: './custom-mobile.component.html',
  imports: [ReactiveFormsModule, FloatLabelModule, InputTextModule],
})
export class CustomMobileComponent {
  @Input() label: string = 'Mobile';
  @Input() formControlRef: FormControl = new FormControl(null);

  readonly id = newFieldId();
  isControlRequired = Validators.required;

  get errorText(): string {
    return fieldErrorText(this.formControlRef, this.label, 'Enter 10 digit mobile number.');
  }

  onInput(): void {
    this.formControlRef.setValue(formatMobile(this.formControlRef.value ?? ''));
  }
}
