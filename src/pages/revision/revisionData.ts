import type { RevisionRecord } from '../../api';
import { topicOfAlgorithm } from '../../data/algorithmCatalog';
import { getAlgorithmById } from '../../data/algorithmMetadata';
import type { AlgorithmId } from '../../types/algorithm';

export type RevisionFilter = 'all' | 'pending' | 'revised';

export interface RevisionRow extends RevisionRecord {
  name: string;
  category: string;
}

/** a record with what the page shows about its algorithm, named as the Visualizer names it */
export const toRevisionRow = (record: RevisionRecord): RevisionRow => {
  const meta = getAlgorithmById(record.algorithmId as AlgorithmId);
  return { ...record, name: meta.name, category: topicOfAlgorithm(record.algorithmId) ?? meta.category };
};

/** the share revised, as a whole percent; 100 only when every one is revised */
export const revisedPercent = (revised: number, total: number): number => {
  if (total === 0) return 0;
  const percent = Math.round((revised / total) * 100);
  return revised < total ? Math.min(percent, 99) : percent;
};

/** the status filter and the name search together; search ignores case and surrounding spaces */
export function filterRevisions(rows: readonly RevisionRow[], filter: RevisionFilter, search: string): RevisionRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter(r => (filter === 'all' || r.status === filter) && (!query || r.name.toLowerCase().includes(query)));
}
