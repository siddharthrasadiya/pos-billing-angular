// Every amount in the app is in rupees, so amounts show as plain numbers and this one line
// (screen header and receipt) says the currency once
export const AMOUNTS_NOTE = 'All amounts in Rs';

export function formatAmount(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function money(n: number): string {
  return formatAmount(n);
}

// Same name always gets the same avatar colour, so regulars are easy to spot in lists
export function avatarHue(name: string): number {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % 360;
  return hash;
}

export function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}
