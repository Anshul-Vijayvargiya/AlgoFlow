/**
 * Algorithm counts for progress, from the same list the app's sidebar and visualizer use (src/data/algorithmMetadata.ts,
 * whose `implemented` flags are tested against the algorithm registry). Shared by the server (which runs from the
 * repository with tsx) and the client, so neither keeps its own copy of the numbers.
 */
import { ALGORITHM_CATEGORIES, ALGORITHM_NAV } from './algorithmMetadata';

/** "LINKED LIST" → "Linked List" */
const topicName = (label: string) => label.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/** every algorithm listed in the app, implemented or not */
export const AVAILABLE_ALGORITHM_COUNT = ALGORITHM_NAV.length;

const implemented = ALGORITHM_NAV.filter(a => a.implemented);
export const IMPLEMENTED_ALGORITHM_IDS: readonly string[] = implemented.map(a => a.id);
export const IMPLEMENTED_ALGORITHM_COUNT = implemented.length;

const topicOf = new Map<string, string>(
  ALGORITHM_NAV.map(a => [a.id, topicName(ALGORITHM_CATEGORIES.find(c => c.id === a.category)?.label ?? a.category)])
);

export const isImplementedAlgorithm = (id: unknown): id is string => typeof id === 'string' && IMPLEMENTED_ALGORITHM_IDS.includes(id);

/** the topic (category) of a listed algorithm, or null */
export const topicOfAlgorithm = (id: string): string | null => topicOf.get(id) ?? null;

/** topics that have at least one implemented algorithm, in the app's order, with those algorithms */
export const IMPLEMENTED_TOPICS: readonly { topic: string; algorithmIds: readonly string[] }[] = ALGORITHM_CATEGORIES.map(c => ({
  topic: topicName(c.label),
  algorithmIds: implemented.filter(a => a.category === c.id).map(a => a.id),
})).filter(t => t.algorithmIds.length > 0);
