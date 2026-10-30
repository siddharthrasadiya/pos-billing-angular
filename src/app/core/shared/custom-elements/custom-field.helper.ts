import { AbstractControl } from '@angular/forms';

let nextFieldId = 1;

export function newFieldId(): string {
  return 'custom-field-' + nextFieldId++;
}

const ERROR_PRIORITY = ['required', 'pattern', 'email', 'min', 'max', 'minlength', 'maxlength'];

export function fieldErrorText(control: AbstractControl, label: string, errorMessage = ''): string {
  if (!control.errors || !(control.touched || control.dirty)) return '';
  const type = ERROR_PRIORITY.find((key) => control.hasError(key)) ?? '';
  switch (type) {
    case 'required':
      return `${label} is required.`;
    case 'pattern':
      return errorMessage || `${label} format is invalid.`;
    case 'email':
      return 'Please enter a valid email address.';
    case 'min':
      return `${label} must be at least ${control.errors['min'].min}.`;
    case 'max':
      return `${label} must not be more than ${control.errors['max'].max}.`;
    case 'minlength':
      return `${label} must be at least ${control.errors['minlength'].requiredLength} characters.`;
    case 'maxlength':
      return `${label} must not exceed ${control.errors['maxlength'].requiredLength} characters.`;
    default:
      return errorMessage;
  }
}
