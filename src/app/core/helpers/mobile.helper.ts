export const MOBILE_PATTERN = /^\d{5}-\d{5}$/;

export function mobileDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// Stored as 10 digits, shown as 12345-67890; partial numbers are formatted while typing
export function formatMobile(value: string): string {
  const digits = mobileDigits(value).slice(0, 10);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
