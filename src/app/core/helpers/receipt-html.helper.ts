import { COLUMN_SPLIT } from '../constants/printer.constant';
import { escapeHtml } from './format.helper';

const ALIGNS = ['left', 'center', 'right'];

function sizeClass(n: number): string {
  const wide = n >> 4 > 0;
  const tall = (n & 0x0f) > 0;
  if (wide && tall) return 'big';
  if (tall) return 'tall';
  return '';
}

// Renders the same ESC/POS text the printer receives, so the preview matches the paper
export function receiptToHtml(text: string): string {
  const style = { align: 'left', bold: false, size: '' };
  const lines: string[] = [];
  let segments: string[] = [];
  let current = '';
  let double = false;
  let columnsAt = -1;

  const pushSegment = () => {
    if (!current) return;
    const classes = [style.bold && 'b', style.size].filter(Boolean).join(' ');
    segments.push(`<span class="${classes}">${escapeHtml(current)}</span>`);
    if (style.size) double = true;
    current = '';
  };

  const pushLine = () => {
    if (columnsAt >= 0) {
      const columns = segments.splice(columnsAt).join('');
      segments.push(`<span class="columns">${columns}</span>`);
    }
    const classes = [style.align, double && 'double', columnsAt >= 0 && 'split'].filter(Boolean);
    lines.push(`<div class="${classes.join(' ')}">${segments.join('')}</div>`);
    segments = [];
    double = false;
    columnsAt = -1;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const cmd = text[i + 1];
    const n = text.charCodeAt(i + 2);

    if (c === '\x1B' && cmd === '@') {
      pushSegment();
      Object.assign(style, { align: 'left', bold: false, size: '' });
      i += 1;
    } else if (c === '\x1B' || c === '\x1D') {
      pushSegment();
      if (c === '\x1B' && cmd === 'a') style.align = ALIGNS[n];
      if (c === '\x1B' && cmd === 'E') style.bold = n === 1;
      if (c === '\x1D' && cmd === '!') style.size = sizeClass(n);
      i += 2;
    } else if (c === COLUMN_SPLIT) {
      pushSegment();
      columnsAt = segments.length;
    } else if (c === '\n') {
      pushSegment();
      pushLine();
    } else {
      current += c;
    }
  }

  pushSegment();
  if (segments.length) pushLine();
  return lines.join('');
}
