import { Component, signal } from '@angular/core';
import { PIN_LENGTH, SecurityService } from '../../service/security.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-pin-pad',
  imports: [IconComponent],
  templateUrl: './pin-pad.component.html',
  styleUrl: './pin-pad.component.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class PinPadComponent {
  readonly slots = Array.from({ length: PIN_LENGTH }, (_, i) => i);
  readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  readonly pin = signal('');
  readonly error = signal('');
  readonly checking = signal(false);
  readonly recovery = signal(false);
  readonly recoveryCode = signal('');

  constructor(protected security: SecurityService) {}

  async press(digit: string): Promise<void> {
    if (this.checking() || this.pin().length >= PIN_LENGTH) return;
    this.error.set('');
    this.pin.update((pin) => pin + digit);
    if (this.pin().length < PIN_LENGTH) return;
    this.checking.set(true);
    const error = await this.security.enterPin(this.pin());
    this.checking.set(false);
    this.pin.set('');
    if (error) this.error.set(error);
    else this.reset();
  }

  back(): void {
    this.pin.update((pin) => pin.slice(0, -1));
  }

  cancel(): void {
    this.reset();
    this.security.cancelPrompt();
  }

  async submitRecovery(): Promise<void> {
    const error = await this.security.useRecoveryCode(this.recoveryCode());
    if (error) {
      this.error.set(error);
      return;
    }
    this.reset();
  }

  showRecovery(show: boolean): void {
    this.recovery.set(show);
    this.error.set('');
    this.recoveryCode.set('');
  }

  onKey(event: KeyboardEvent): void {
    if (!this.security.prompt()) return;
    if (event.key === 'Escape') {
      this.cancel();
    } else if (!this.recovery() && /^[0-9]$/.test(event.key)) {
      event.preventDefault();
      this.press(event.key);
    } else if (!this.recovery() && event.key === 'Backspace') {
      event.preventDefault();
      this.back();
    }
  }

  private reset(): void {
    this.pin.set('');
    this.error.set('');
    this.recovery.set(false);
    this.recoveryCode.set('');
  }
}
