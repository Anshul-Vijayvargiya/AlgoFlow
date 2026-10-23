/** The AI Tutor conversation, kept only in the browser (never stored): what is shown, and what is sent back. */

export type TutorMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'model'; text: string; truncated: boolean }
  /** the tutor could not answer `question`; it can be asked again */
  | { id: number; role: 'error'; text: string; question: string };

/** the server's limits (server/routes/tutorRoutes.ts) */
export const HISTORY_MAX_TURNS = 6;
export const HISTORY_TURN_MAX_CHARS = 1000;

/**
 * The turns sent with a new question: the latest question/answer pairs, oldest first, each cut to the server's
 * limit. Errors are not part of the conversation. History always starts with a user turn, as the model expects.
 */
export function historyForRequest(messages: readonly TutorMessage[]): { role: 'user' | 'model'; text: string }[] {
  const turns = messages
    .filter((m): m is Extract<TutorMessage, { role: 'user' | 'model' }> => m.role === 'user' || m.role === 'model')
    .map(m => ({ role: m.role, text: m.text.slice(0, HISTORY_TURN_MAX_CHARS) }));
  // a question that got no answer (it failed) is dropped, so turns alternate user/model
  const paired: typeof turns = [];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role === 'user' && turns[i + 1]?.role === 'model') paired.push(turns[i], turns[i + 1]);
  }
  return paired.slice(-HISTORY_MAX_TURNS);
}
