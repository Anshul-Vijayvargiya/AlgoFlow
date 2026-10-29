/**
 * Sidebar search: which algorithms a query matches. It filters the app's own algorithm list (ALGORITHM_NAV, passed
 * in), never a copy of it, and matches algorithm names only: case-insensitive, ignoring surrounding spaces and runs of
 * spaces. An empty query matches everything (the full list).
 */
export const normalizeQuery = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

export function filterByName<T extends { name: string }>(items: readonly T[], query: string): T[] {
  const q = normalizeQuery(query);
  return q ? items.filter(item => item.name.toLowerCase().includes(q)) : [...items];
}
