import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SelectChangeEvent, SelectModule } from 'primeng/select';
import { fieldErrorText, newFieldId } from '../custom-field.helper';

@Component({
  selector: 'custom-select',
  templateUrl: './custom-select.component.html',
  imports: [ReactiveFormsModule, FloatLabelModule, SelectModule],
})
export class CustomSelectComponent {
  @Input() label: string = '';
  @Input() formControlRef: FormControl = new FormControl(null);
  @Input() options: any[] = [];
  @Input() optionLabel: string = 'name';
  @Input() optionValue: string = 'id';
  @Input() filter: boolean | null = null;
  @Input() showClear: boolean = false;
  @Input() emptyMessage: string = 'No options';
  @Output() onSelectChange: EventEmitter<SelectChangeEvent> = new EventEmitter();

  readonly id = newFieldId();
  isControlRequired = Validators.required;

  get errorText(): string {
    return fieldErrorText(this.formControlRef, this.label);
  }

  get hasFilter(): boolean {
    return this.filter ?? this.options.length > 7;
  }
}
