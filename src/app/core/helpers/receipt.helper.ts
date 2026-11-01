import { COLUMN_SPLIT, ESC, LINE_WIDTH } from '../constants/printer.constant';
import { BillLanguage } from '../enums/bill-language.enum';
import { BillStatus } from '../enums/bill-status.enum';
import { IReceiptBill, IReceiptItem, IShopSettings } from '../models/models';
import customDatetime from '../shared/custom-elements/custom-datetime.pipe';
import { roundMoney } from './bill.helper';
import { AMOUNTS_NOTE, formatAmount } from './format.helper';

// GST Rule 46(b): consecutive serial, max 16 chars, unique per financial year (April-March)
export function financialYear(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function billNoPrefix(date: Date): string {
  return `INV/${financialYear(date)}/`;
}

export function formatBillNo(prefix: string, serial: number): string {
  return prefix + String(serial).padStart(5, '0');
}

// Same date-time style as the rest of the app: 01 Nov 2026, 04:39 PM
const RECEIPT_DATE_FORMAT = 'DD MMM YYYY, hh:mm A';

function divider(char = '-'): string {
  return char.repeat(LINE_WIDTH) + '\n';
}

function columns(left: string, right: string, width = LINE_WIDTH): string {
  const space = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, space)) + right + '\n';
}

function itemRow(name: string, qty: string, amount: string): string {
  const fitsColumns = qty.length <= 4 && amount.length <= 9;
  const isAscii = /^[ -~]*$/.test(name);
  const right = fitsColumns
    ? qty.padStart(4) + amount.padStart(10)
    : (qty.padStart(4) + '  ' + amount).padStart(14);
  if (isAscii && name.length <= 18 && fitsColumns) {
    return name.padEnd(18) + right + '\n';
  }
  // Non-English names print as an image; the encoder puts them on one row with the columns when they fit
  if (!isAscii && fitsColumns) return name + COLUMN_SPLIT + right + '\n';
  // "2 box" is wider than the Qty column: a short name still fits on one line, else the name goes
  // on its own line; amounts stay right-aligned under the other amounts
  const amountWidth = Math.max(10, amount.length + 1);
  const qtyWidth = Math.max(qty.length, LINE_WIDTH - amountWidth - 18);
  const wide = qty.padStart(qtyWidth) + amount.padStart(amountWidth);
  if (isAscii && name.length < LINE_WIDTH - wide.length) {
    return name.padEnd(LINE_WIDTH - wide.length) + wide + '\n';
  }
  return name + '\n' + wide.padStart(LINE_WIDTH) + '\n';
}

function receiptHeader(shop: IShopSettings): string {
  let r = ESC.center + ESC.boldOn + shop.name + '\n' + ESC.boldOff;
  if (shop.address) r += shop.address + '\n';
  if (shop.gst) r += 'GSTIN: ' + shop.gst + '\n';
  return r + ESC.left;
}

// "2 box" when the line has a unit; plain quantity for products with one unit
function qtyText(item: IReceiptItem): string {
  return item.unit ? `${item.qty} ${item.unit}` : String(item.qty);
}

export function buildReceipt(shop: IShopSettings, bill: IReceiptBill): string {
  const totalQty = bill.items.reduce((sum, i) => sum + i.qty, 0);
  // Boxes and pieces do not add up, so the total quantity is left out when units are mixed
  const hasUnits = bill.items.some((i) => i.unit);

  let r = receiptHeader(shop);
  r += divider();
  const dateText = customDatetime(bill.date, { format: RECEIPT_DATE_FORMAT });
  r +=
    bill.no.length + dateText.length < LINE_WIDTH
      ? columns(bill.no, dateText)
      : bill.no + '\n' + dateText + '\n';
  if (bill.customerName) r += 'Customer: ' + bill.customerName + '\n';
  r += divider();
  r += ESC.boldOn + itemRow('Item', 'Qty', 'Amount') + ESC.boldOff;
  for (const i of bill.items) {
    const name = bill.printLanguage === BillLanguage.Gujarati && i.localName ? i.localName : i.name;
    r += itemRow(name, qtyText(i), formatAmount(roundMoney(i.qty * i.rate)));
  }
  r += divider();
  r += hasUnits
    ? 'Items: ' + bill.items.length + '\n'
    : columns('Items: ' + bill.items.length, 'Qty: ' + totalQty);
  if (bill.discount) {
    r += columns('Subtotal', formatAmount(bill.subtotal ?? bill.total + bill.discount));
    r += columns('Discount', '-' + formatAmount(bill.discount));
  }
  const totalText = formatAmount(bill.total);
  if (totalText.length > LINE_WIDTH / 2) {
    r += ESC.boldOn + ESC.tallOn + columns('TOTAL', totalText) + ESC.bigOff + ESC.boldOff;
  } else {
    r += ESC.boldOn + ESC.bigOn;
    r +=
      totalText.length > 10
        ? 'TOTAL\n' + ESC.right + totalText + '\n' + ESC.left
        : columns('TOTAL', totalText, LINE_WIDTH / 2);
    r += ESC.bigOff + ESC.boldOff;
  }
  if (bill.status === BillStatus.Cancelled) {
    r += ESC.center + ESC.boldOn + '*** CANCELLED ***\n' + ESC.boldOff + ESC.left;
  } else {
    const account = accountLines(bill);
    if (account.length) {
      r += divider();
      account.forEach(([label, value], i) => {
        const line = columns(label, value);
        r += i === account.length - 1 ? ESC.boldOn + line + ESC.boldOff : line;
      });
    }
  }
  return r;
}

function balanceText(balance: number): [string, string] {
  return balance < 0 ? ['Advance', formatAmount(-balance)] : ['Total due', formatAmount(balance)];
}

// The customer's account as it stood when this bill was issued, so a shop sees on every bill how
// much is pending up to that bill. Left out when nothing was pending, nothing paid and no due left
function accountLines(bill: IReceiptBill): [string, string][] {
  if (bill.previousBalance === undefined || bill.balanceAfter === undefined) return [];
  const paid = bill.paidAmount ?? 0;
  if (!bill.previousBalance && !paid && bill.balanceAfter === bill.total) return [];
  const lines: [string, string][] = [];
  if (bill.previousBalance > 0) lines.push(['Previous due', formatAmount(bill.previousBalance)]);
  if (bill.previousBalance < 0) {
    lines.push(['Previous advance', '-' + formatAmount(-bill.previousBalance)]);
  }
  lines.push(['This bill', formatAmount(bill.total)]);
  if (paid > 0) lines.push(['Received', '-' + formatAmount(paid)]);
  lines.push(balanceText(bill.balanceAfter));
  return lines;
}

// Message for WhatsApp / SMS / mail. Chat apps use a normal (not fixed-width) font, so this is
// a simple list instead of the column layout of the printed receipt; *text* is bold in WhatsApp
export function buildShareText(shop: IShopSettings, bill: IReceiptBill): string {
  const lines = [`*${shop.name}*`];
  lines.push(`Bill ${bill.no}`, customDatetime(bill.date, { format: RECEIPT_DATE_FORMAT }));
  if (bill.customerName) lines.push('Customer: ' + bill.customerName);
  lines.push('');
  for (const i of bill.items) {
    const name = bill.printLanguage === BillLanguage.Gujarati && i.localName ? i.localName : i.name;
    lines.push(name);
    lines.push(
      `   ${qtyText(i)} x ${formatAmount(i.rate)} = ${formatAmount(roundMoney(i.qty * i.rate))}`,
    );
  }
  lines.push('');
  if (bill.discount) {
    lines.push('Subtotal: ' + formatAmount(bill.subtotal ?? bill.total + bill.discount));
    lines.push('Discount: -' + formatAmount(bill.discount));
  }
  lines.push(`*Total: ${formatAmount(bill.total)}*`);
  if (bill.status === BillStatus.Cancelled) {
    lines.push('*CANCELLED*');
  } else {
    const account = accountLines(bill);
    if (account.length) lines.push('');
    account.forEach(([label, value], i) =>
      lines.push(i === account.length - 1 ? `*${label}: ${value}*` : `${label}: ${value}`),
    );
  }
  lines.push('', AMOUNTS_NOTE, 'Thank you!');
  return lines.join('\n');
}

export function buildTestReceipt(shop: IShopSettings): string {
  return (
    receiptHeader(shop) +
    divider() +
    ESC.center +
    'Printer test OK\n' +
    customDatetime(new Date(), { format: RECEIPT_DATE_FORMAT }) +
    '\n'
  );
}
