// "Tata  Salt" and "tata salt" are the same name
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isDuplicateName<T extends { id: string; name: string }>(
  rows: T[],
  name: string,
  ownId?: string,
): boolean {
  const key = nameKey(name);
  return rows.some((row) => row.id !== ownId && nameKey(row.name) === key);
}
