import { ESC, LINE_WIDTH } from '../constants/printer.constant';
import { BillStatus } from '../enums/bill-status.enum';
import { IReceiptBill, IShopSettings } from '../models/models';
import { formatAmount, formatDate } from './format.helper';

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

function divider(char = '-'): string {
  return char.repeat(LINE_WIDTH) + '\n';
}

function columns(left: string, right: string, width = LINE_WIDTH): string {
  const space = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, space)) + right + '\n';
}

function itemRow(name: string, qty: string, amount: string): string {
  const fitsColumns = qty.length <= 4 && amount.length <= 9;
  const right = fitsColumns
    ? qty.padStart(4) + amount.padStart(10)
    : (qty.padStart(4) + '  ' + amount).padStart(14);
  if (name.length <= 18 && fitsColumns) {
    return name.padEnd(18) + right + '\n';
  }
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
  const dateText = formatDate(new Date(bill.date));
  r +=
    bill.no.length + dateText.length < LINE_WIDTH
      ? columns(bill.no, dateText)
      : bill.no + '\n' + dateText + '\n';
  if (bill.customerName) r += 'Customer: ' + bill.customerName + '\n';
  if (bill.customerMobile) r += 'Mobile: ' + bill.customerMobile + '\n';
  r += divider();
  r += ESC.boldOn + itemRow('Item', 'Qty', 'Amount') + ESC.boldOff;
  for (const i of bill.items) {
    r += itemRow(i.name, String(i.qty), formatAmount(i.qty * i.rate));
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
    r += ESC.boldOn + columns('Balance due', formatAmount(bill.total - bill.paidAmount)) + ESC.boldOff;
  }
  return r;
}

export function buildTestReceipt(shop: IShopSettings): string {
  return (
    receiptHeader(shop) +
    divider() +
    ESC.center +
    'Printer test OK\n' +
    formatDate(new Date()) +
    '\n'
  );
}
