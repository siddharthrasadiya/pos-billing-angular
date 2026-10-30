import { COLUMN_SPLIT, LINE_WIDTH } from '../constants/printer.constant';

const PRINT_WIDTH_DOTS = 384;
const CHAR_DOTS = PRINT_WIDTH_DOTS / LINE_WIDTH;
const COLUMN_FONT = '22px Consolas, "DejaVu Sans Mono", monospace';
const RASTER_FONT_PX = 24;
// Same pitch as a printer text line (ESC 2 default); taller only when the glyphs need it
const LINE_DOTS = 30;
const INK_PADDING = 2;
const RASTER_FONT = '"Noto Sans Gujarati", "Shruti", "Nirmala UI", sans-serif';
const ASCII_LINE = /^[\x00-\x7F]*$/;
const COMMAND = /\x1B@|[\x1B\x1D][\s\S]{2}/g;

interface ILineStyle {
  align: number;
  bold: boolean;
}

// Cheap ESC/POS printers only have English fonts built in, so any line with other
// characters (Gujarati names) is drawn on a canvas and sent as a GS v 0 raster image
export function encodeReceipt(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const style: ILineStyle = { align: 0, bold: false };
  const parts: Uint8Array[] = [];

  for (const line of text.split('\n').map((l, i, all) => (i < all.length - 1 ? l + '\n' : l))) {
    if (ASCII_LINE.test(line)) {
      applyCommands(line, style);
      parts.push(encoder.encode(line));
      continue;
    }
    const commands = line.match(COMMAND) ?? [];
    parts.push(encoder.encode(commands.join('')));
    applyCommands(line, style);
    const plain = line.replace(COMMAND, '').replace(/\n$/, '');
    if (plain.includes(COLUMN_SPLIT)) parts.push(...itemRow(plain, style, encoder));
    else if (plain.trim()) parts.push(rasterLine(plain, style));
    else if (line.endsWith('\n')) parts.push(encoder.encode('\n'));
  }

  const bytes = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function applyCommands(line: string, style: ILineStyle): void {
  for (const command of line.match(COMMAND) ?? []) {
    if (command === '\x1B@') Object.assign(style, { align: 0, bold: false });
    else if (command.startsWith('\x1Ba')) style.align = command.charCodeAt(2);
    else if (command.startsWith('\x1BE')) style.bold = command.charCodeAt(2) === 1;
  }
}

function rasterFont(style: ILineStyle): string {
  return `${style.bold ? 'bold ' : ''}${RASTER_FONT_PX}px ${RASTER_FONT}`;
}

// Name, qty and amount in one image row, with qty and amount on the same columns as English rows
function itemRow(text: string, style: ILineStyle, encoder: TextEncoder): Uint8Array[] {
  const [name, columns] = text.split(COLUMN_SPLIT);
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = rasterFont(style);
  const nameRoom = PRINT_WIDTH_DOTS - (columns.trimStart().length + 1) * CHAR_DOTS;
  if (context.measureText(name).width > nameRoom) {
    return [rasterLine(name, style), encoder.encode(columns.padStart(LINE_WIDTH) + '\n')];
  }
  const qtyEnd = PRINT_WIDTH_DOTS - (columns.length - 4) * CHAR_DOTS;
  return [
    rasterLine(name, { ...style, align: 0 }, (row, baseline) => {
      row.font = COLUMN_FONT;
      row.textAlign = 'right';
      row.fillText(columns.slice(0, 4).trim(), qtyEnd, baseline);
      row.fillText(columns.slice(4).trim(), PRINT_WIDTH_DOTS, baseline);
    }),
  ];
}

function rasterLine(
  text: string,
  style: ILineStyle,
  drawColumns?: (context: CanvasRenderingContext2D, baseline: number) => void,
): Uint8Array {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const font = rasterFont(style);
  context.font = font;
  const metrics = context.measureText(text);
  const textWidth = Math.min(PRINT_WIDTH_DOTS, Math.ceil(metrics.width) + 2);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
  const inkHeight = ascent + Math.ceil(metrics.actualBoundingBoxDescent);

  canvas.width =
    style.align === 0 && !drawColumns ? Math.ceil(textWidth / 8) * 8 : PRINT_WIDTH_DOTS;
  canvas.height = Math.max(LINE_DOTS, inkHeight + INK_PADDING * 2);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  context.font = font;
  context.textBaseline = 'alphabetic';
  const x =
    style.align === 1
      ? (canvas.width - textWidth) / 2
      : style.align === 2
        ? canvas.width - textWidth
        : 0;
  const baseline = Math.floor((canvas.height - inkHeight) / 2) + ascent;
  context.fillText(text, x, baseline);
  drawColumns?.(context, baseline);

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const bytesPerRow = canvas.width / 8;
  const raster = new Uint8Array(bytesPerRow * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let px = 0; px < canvas.width; px++) {
      const i = (y * canvas.width + px) * 4;
      if (data[i] + data[i + 1] + data[i + 2] < 384) {
        raster[y * bytesPerRow + (px >> 3)] |= 0x80 >> (px & 7);
      }
    }
  }

  const header = [
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    bytesPerRow >> 8,
    canvas.height & 0xff,
    canvas.height >> 8,
  ];
  const command = new Uint8Array(header.length + raster.length);
  command.set(header);
  command.set(raster, header.length);
  return command;
}
