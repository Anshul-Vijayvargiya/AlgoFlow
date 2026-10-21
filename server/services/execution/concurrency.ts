/**
 * One execution at a time per user, across the Playground and Practice judging, so a user cannot multiply their
 * load on the provider by sending requests in parallel. In-memory: per server process.
 */
const active = new Set<string>();

/** true when the user had nothing running and now holds the slot; call finishExecution afterwards */
export function tryStartExecution(userId: string): boolean {
  if (active.has(userId)) return false;
  active.add(userId);
  return true;
}

export function finishExecution(userId: string): void {
  active.delete(userId);
}
