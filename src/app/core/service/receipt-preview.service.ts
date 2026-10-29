import { Injectable, signal } from '@angular/core';
import { ESC } from '../constants/printer.constant';

@Injectable({
  providedIn: 'root',
})
export class ReceiptPreviewService {
  readonly receipt = signal<string | null>(null);

  show(text: string): void {
    this.receipt.set(ESC.init + text + ESC.feed);
  }

  close(): void {
    this.receipt.set(null);
  }
}
