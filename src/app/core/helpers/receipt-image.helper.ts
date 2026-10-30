import { COLUMN_SPLIT, LINE_WIDTH } from '../constants/printer.constant';

const WIDTH = 600;
const PADDING = 28;
const MONO = 'Consolas, "DejaVu Sans Mono", "Courier New", monospace';
const LOCAL = '"Noto Sans Gujarati", "Shruti", "Nirmala UI", sans-serif';
const COMMAND = /\x1B@|[\x1B\x1D][\s\S]{2}/g;
const ASCII = /^[\x00-\x7F]*$/;

interface ILine {
  text: string;
  align: number;
  bold: boolean;
  scale: number;
}

// Splits the ESC/POS receipt into plain lines with their style, like the printer would
function parseLines(receipt: string): ILine[] {
  const style = { align: 0, bold: false, scale: 1 };
  const lines: ILine[] = [];
  for (const raw of receipt.split('\n')) {
    for (const command of raw.match(COMMAND) ?? []) {
      if (command === '\x1B@') Object.assign(style, { align: 0, bold: false, scale: 1 });
      else if (command.startsWith('\x1Ba')) style.align = command.charCodeAt(2);
      else if (command.startsWith('\x1BE')) style.bold = command.charCodeAt(2) === 1;
      else if (command.startsWith('\x1D!')) {
        const n = command.charCodeAt(2);
        style.scale = n & 0x0f ? (n >> 4 ? 2 : 1.6) : 1;
      }
    }
    lines.push({ text: raw.replace(COMMAND, ''), ...style });
  }
  while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop();
  return lines;
}

// Draws the receipt on a white canvas (used for the PDF); Gujarati is drawn by the browser,
// so it looks right without any font files
export function receiptToCanvas(receipt: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const inner = WIDTH - PADDING * 2;
  context.font = `40px ${MONO}`;
  const fontSize = (40 * inner) / context.measureText('M'.repeat(LINE_WIDTH)).width;
  const lineHeight = Math.round(fontSize * 1.5);

  const lines = parseLines(receipt);
  const height = PADDING * 2 + lines.reduce((sum, l) => sum + lineHeight * l.scale, 0);
  canvas.width = WIDTH;
  canvas.height = Math.ceil(height);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  context.textBaseline = 'middle';

  let y = PADDING;
  for (const line of lines) {
    const size = fontSize * line.scale;
    const middle = y + (lineHeight * line.scale) / 2;
    const weight = line.bold ? 'bold ' : '';
    if (line.text.includes(COLUMN_SPLIT)) {
      const [name, columns] = line.text.split(COLUMN_SPLIT);
      context.font = `${weight}${size}px ${LOCAL}`;
      context.textAlign = 'left';
      context.fillText(name, PADDING, middle);
      context.font = `${weight}${size}px ${MONO}`;
      context.textAlign = 'right';
      context.fillText(columns, WIDTH - PADDING, middle);
    } else if (line.text.trim()) {
      context.font = `${weight}${size}px ${ASCII.test(line.text) ? MONO : LOCAL}`;
      const align = ['left', 'center', 'right'][line.align] as CanvasTextAlign;
      context.textAlign = align;
      const x = align === 'center' ? WIDTH / 2 : align === 'right' ? WIDTH - PADDING : PADDING;
      context.fillText(line.text, x, middle);
    }
    y += lineHeight * line.scale;
  }
  return canvas;
}
