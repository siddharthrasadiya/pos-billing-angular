import { COLUMN_SPLIT, ESC, LINE_WIDTH } from '../constants/printer.constant';
import { BillLanguage } from '../enums/bill-language.enum';
import { BillStatus } from '../enums/bill-status.enum';
import { IReceiptBill, IShopSettings } from '../models/models';
import customDatetime from '../shared/custom-elements/custom-datetime.pipe';
import { roundMoney } from './bill.helper';
import { AMOUNTS_NOTE, formatAmount } from './format.helper';
import { formatMobile } from './mobile.helper';

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

const RECEIPT_DATE_FORMAT = 'DD-MM-YYYY HH:mm';

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
  return name + '\n' + right.padStart(LINE_WIDTH) + '\n';
}

function receiptHeader(shop: IShopSettings): string {
  let r = ESC.center + ESC.boldOn + shop.name + '\n' + ESC.boldOff;
  if (shop.address) r += shop.address + '\n';
  if (shop.gst) r += 'GSTIN: ' + shop.gst + '\n';
  return r + ESC.left;
}

export function buildReceipt(shop: IShopSettings, bill: IReceiptBill): string {
  const totalQty = bill.items.reduce((sum, i) => sum + i.qty, 0);

  let r = receiptHeader(shop);
  r += divider();
  const dateText = customDatetime(bill.date, { format: RECEIPT_DATE_FORMAT });
  r +=
    bill.no.length + dateText.length < LINE_WIDTH
      ? columns(bill.no, dateText)
      : bill.no + '\n' + dateText + '\n';
  if (bill.customerName) r += 'Customer: ' + bill.customerName + '\n';
  if (bill.customerMobile) r += 'Mobile: ' + formatMobile(bill.customerMobile) + '\n';
  r += divider();
  r += ESC.boldOn + itemRow('Item', 'Qty', 'Amount') + ESC.boldOff;
  for (const i of bill.items) {
    const name = bill.printLanguage === BillLanguage.Gujarati && i.localName ? i.localName : i.name;
    r += itemRow(name, String(i.qty), formatAmount(roundMoney(i.qty * i.rate)));
  }
  r += divider();
  r += columns('Items: ' + bill.items.length, 'Qty: ' + totalQty);
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
  } else if (bill.paidAmount !== undefined && bill.paidAmount < bill.total) {
    r += columns('Paid', formatAmount(bill.paidAmount));
    r +=
      ESC.boldOn +
      columns('Balance due', formatAmount(roundMoney(bill.total - bill.paidAmount))) +
      ESC.boldOff;
  }
  r += ESC.center + AMOUNTS_NOTE + '\n' + ESC.left;
  return r;
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
      `   ${i.qty} x ${formatAmount(i.rate)} = ${formatAmount(roundMoney(i.qty * i.rate))}`,
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
  } else if (bill.paidAmount !== undefined && bill.paidAmount < bill.total) {
    lines.push('Paid: ' + formatAmount(bill.paidAmount));
    lines.push(`*Balance due: ${formatAmount(roundMoney(bill.total - bill.paidAmount))}*`);
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
