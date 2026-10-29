import { afterRenderEffect, Component, computed, ElementRef, viewChild } from '@angular/core';
import { LINE_WIDTH } from '../../constants/printer.constant';
import { receiptToHtml } from '../../helpers/receipt-html.helper';
import { ReceiptPreviewService } from '../../service/receipt-preview.service';

@Component({
  selector: 'app-receipt-preview',
  templateUrl: './receipt-preview.component.html',
  styleUrl: './receipt-preview.component.scss',
})
export class ReceiptPreviewComponent {
  readonly html = computed(() => {
    const receipt = this.preview.receipt();
    return receipt === null ? null : receiptToHtml(receipt);
  });
  private readonly paper = viewChild<ElementRef<HTMLElement>>('paper');

  constructor(protected preview: ReceiptPreviewService) {
    afterRenderEffect(() => {
      const paper = this.paper();
      if (paper && this.html()) this.fitFontToPrinter(paper.nativeElement);
    });
  }

  // Printer font is 12 dots wide, so 32 characters fill the 48mm print area exactly
  private fitFontToPrinter(paper: HTMLElement): void {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(LINE_WIDTH);
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:20px';
    paper.appendChild(probe);
    const fontWidth = probe.getBoundingClientRect().width;
    probe.remove();

    const area = document.createElement('div');
    area.style.width = '48mm';
    paper.appendChild(area);
    const printWidth = area.getBoundingClientRect().width;
    area.remove();

    paper.style.setProperty('--font-size', (20 * printWidth) / fontWidth + 'px');
  }
}
