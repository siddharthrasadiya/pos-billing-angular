const PRINT_WIDTH_DOTS = 384;
const RASTER_FONT_PX = 24;
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
    if (plain.trim()) parts.push(rasterLine(plain, style));
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

function rasterLine(text: string, style: ILineStyle): Uint8Array {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const font = `${style.bold ? 'bold ' : ''}${RASTER_FONT_PX}px ${RASTER_FONT}`;
  context.font = font;
  const textWidth = Math.min(PRINT_WIDTH_DOTS, Math.ceil(context.measureText(text).width) + 2);

  canvas.width = style.align === 0 ? Math.ceil(textWidth / 8) * 8 : PRINT_WIDTH_DOTS;
  canvas.height = Math.ceil(RASTER_FONT_PX * 1.5);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  context.font = font;
  context.textBaseline = 'middle';
  const x = style.align === 1 ? (canvas.width - textWidth) / 2 : style.align === 2 ? canvas.width - textWidth : 0;
  context.fillText(text, x, canvas.height / 2);

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

  const header = [0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, canvas.height & 0xff, canvas.height >> 8];
  const command = new Uint8Array(header.length + raster.length);
  command.set(header);
  command.set(raster, header.length);
  return command;
}
