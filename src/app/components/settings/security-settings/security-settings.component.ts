import { Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { PIN_LENGTH, SecurityService, ToastersService } from 'src/app/core.index';

@Component({
  selector: 'app-security-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './security-settings.component.html',
  styleUrl: './security-settings.component.scss',
})
export class SecuritySettingsComponent {
  readonly pinLength = PIN_LENGTH;
  // Shown once after a PIN is set, for the owner to write down
  readonly recoveryCode = signal('');
  readonly saving = signal(false);

  readonly form = new FormGroup({
    pin: new FormControl('', { nonNullable: true }),
    confirm: new FormControl('', { nonNullable: true }),
  });

  constructor(
    protected security: SecurityService,
    private toasters: ToastersService,
  ) {}

  // A typed letter would take one of the 4 places, so it never gets in
  blockNonDigits(event: InputEvent): void {
    if (event.data?.length === 1 && /\D/.test(event.data)) event.preventDefault();
  }

  // Pasted text keeps only its digits
  onlyDigits(control: FormControl<string>, input: HTMLInputElement): void {
    const digits = input.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (digits !== input.value) control.setValue(digits);
  }

  async savePin(): Promise<void> {
    const { pin, confirm } = this.form.getRawValue();
    if (pin.length !== PIN_LENGTH) {
      this.toasters.warn(`Enter a ${PIN_LENGTH}-digit PIN`);
      return;
    }
    if (pin !== confirm) {
      this.toasters.warn('The two PINs do not match');
      return;
    }
    const changing = this.security.hasPin();
    this.saving.set(true);
    try {
      this.recoveryCode.set(await this.security.setPin(pin));
      this.form.reset();
      this.toasters.success(changing ? 'PIN changed' : 'PIN is on');
    } catch (err) {
      this.toasters.error('Could not save PIN: ' + (err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async removePin(): Promise<void> {
    if (!confirm('Remove the PIN? Anyone using this phone can then change or delete data.')) {
      return;
    }
    await this.security.removePin();
    this.recoveryCode.set('');
    this.toasters.success('PIN removed');
  }
}
