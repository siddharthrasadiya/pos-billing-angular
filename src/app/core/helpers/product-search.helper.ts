interface ISearchable {
  name: string;
  shortName: string;
  localName?: string;
}

// Short name matches rank above name matches; lower rank = shown first
function matchRank(item: ISearchable, query: string): number {
  const short = item.shortName.toLowerCase();
  const name = item.name.toLowerCase();
  if (short && short === query) return 0;
  if (short.startsWith(query)) return 1;
  if (short.includes(query)) return 2;
  if (name.startsWith(query)) return 3;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 4;
  if (name.includes(query)) return 5;
  if ((item.localName ?? '').toLowerCase().includes(query)) return 6;
  return -1;
}

export function searchProducts<T extends ISearchable>(items: T[], rawQuery: string): T[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...items].sort((a, b) => a.name.localeCompare(b.name));
  return items
    .map((item) => ({ item, rank: matchRank(item, query) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name))
    .map((r) => r.item);
}
