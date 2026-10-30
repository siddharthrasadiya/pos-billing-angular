import { Component } from '@angular/core';
import { PrinterService, ToastersService } from 'src/app/core.index';

const RECONNECT_FLAG = 'chrome://flags/#enable-web-bluetooth-new-permissions-backend';

@Component({
  selector: 'app-setup-guide',
  templateUrl: './setup-guide.component.html',
  styleUrl: './setup-guide.component.scss',
})
export class SetupGuideComponent {
  readonly reconnectFlag = RECONNECT_FLAG;

  constructor(
    protected printer: PrinterService,
    private toasters: ToastersService,
  ) {}

  // Web pages cannot open chrome:// links, so the address is copied for pasting in the address bar
  async copyFlag(): Promise<void> {
    try {
      await navigator.clipboard.writeText(RECONNECT_FLAG);
      this.toasters.success('Copied. Paste it in the Chrome address bar');
    } catch {
      this.toasters.warn('Could not copy. Type the address shown above');
    }
  }
}
