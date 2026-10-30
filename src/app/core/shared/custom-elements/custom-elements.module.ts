import { NgModule } from '@angular/core';
import { CustomDateComponent } from './custom-date/custom-date.component';
import { CustomDatetimePipe } from './custom-datetime.pipe';
import { CustomInputComponent } from './custom-input/custom-input.component';
import { CustomMobileComponent } from './custom-mobile/custom-mobile.component';
import { CustomNumberInputComponent } from './custom-number-input/custom-number-input.component';
import { CustomSelectComponent } from './custom-select/custom-select.component';
import { CustomTextareaComponent } from './custom-textarea/custom-textarea.component';

const CUSTOM_ELEMENTS = [
  CustomInputComponent,
  CustomMobileComponent,
  CustomNumberInputComponent,
  CustomTextareaComponent,
  CustomSelectComponent,
  CustomDateComponent,
  CustomDatetimePipe,
];

@NgModule({
  imports: CUSTOM_ELEMENTS,
  exports: CUSTOM_ELEMENTS,
})
export class CustomElementModule {}
