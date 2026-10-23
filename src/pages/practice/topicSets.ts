import type { PracticeProblem } from '../../types/algorithm';

/**
 * Topic learning sets: the published practice problems grouped by their own `category` (the same field the Practice
 * topic filter sends to the server), so a set is exactly what selecting that topic shows. Nothing is invented: a topic
 * exists only when at least one problem has it.
 */
export interface TopicSet {
  topic: string;
  /** published problems in this topic */
  total: number;
  /** of those, problems the signed-in user has solved (an accepted submission; recorded attempts do not count) */
  solved: number;
  byDifficulty: Record<PracticeProblem['difficulty'], number>;
}

export function buildTopicSets(problems: readonly PracticeProblem[]): TopicSet[] {
  const sets = new Map<string, TopicSet>();
  for (const p of problems) {
    // exactly as stored (the server filters on the exact value; admin input is trimmed when saved)
    const topic = p.category;
    if (typeof topic !== 'string' || !topic.trim()) continue;
    let set = sets.get(topic);
    if (!set) {
      set = { topic, total: 0, solved: 0, byDifficulty: { Easy: 0, Medium: 0, Hard: 0 } };
      sets.set(topic, set);
    }
    set.total += 1;
    if (p.solved === true) set.solved += 1;
    if (p.difficulty in set.byDifficulty) set.byDifficulty[p.difficulty] += 1;
  }
  return [...sets.values()].sort((a, b) => a.topic.localeCompare(b.topic));
}

/** solved share of a set, 0–100, rounded down so a set is never shown as complete before it is */
export const solvedPercent = (set: Pick<TopicSet, 'total' | 'solved'>) =>
  set.total > 0 ? Math.floor((Math.min(set.solved, set.total) / set.total) * 100) : 0;
