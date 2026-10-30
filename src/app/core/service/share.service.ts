import { Injectable } from '@angular/core';
import { ToastersService } from './toasters.service';

// India country code; customer mobiles are stored as 10 digits
const WHATSAPP_COUNTRY_CODE = '91';

// Uses the phone's own share sheet (WhatsApp, SMS, Gmail, Drive ...) where the browser has one;
// otherwise text is copied and files are downloaded
@Injectable({
  providedIn: 'root',
})
export class ShareService {
  constructor(private toasters: ToastersService) {}

  async shareText(title: string, text: string): Promise<void> {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
      } catch (err) {
        if (!isCancelled(err)) this.toasters.error('Could not share: ' + (err as Error).message);
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.toasters.success('Bill copied. Paste it in any app');
    } catch {
      this.toasters.warn('Sharing is not available in this browser');
    }
  }

  async shareFile(file: File, title: string): Promise<void> {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title, files: [file] });
      } catch (err) {
        if (!isCancelled(err)) this.toasters.error('Could not share: ' + (err as Error).message);
      }
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    this.toasters.success(`${file.name} downloaded`);
  }

  // Opens a chat with this number in WhatsApp (app on a phone, WhatsApp Web on a PC)
  openWhatsApp(mobile: string, text: string): void {
    const url = `https://wa.me/${WHATSAPP_COUNTRY_CODE}${mobile}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }
}

// Closing the share sheet without picking an app is not an error
function isCancelled(err: unknown): boolean {
  return (err as Error)?.name === 'AbortError';
}
