import { describe, it, expect } from 'vitest';
import { HISTORY_MAX_TURNS, HISTORY_TURN_MAX_CHARS, historyForRequest, type TutorMessage } from '../tutorConversation';

let id = 0;
const user = (text: string): TutorMessage => ({ id: ++id, role: 'user', text });
const model = (text: string): TutorMessage => ({ id: ++id, role: 'model', text, truncated: false });
const error = (question: string): TutorMessage => ({ id: ++id, role: 'error', text: 'failed', question });

describe('history sent with a new question', () => {
  it('is empty at the start', () => {
    expect(historyForRequest([])).toEqual([]);
  });

  it('keeps answered question/answer pairs in order, drops errors and unanswered questions', () => {
    const msgs = [user('q1'), model('a1'), user('q2'), error('q2'), user('q3'), model('a3')];
    expect(historyForRequest(msgs)).toEqual([
      { role: 'user', text: 'q1' },
      { role: 'model', text: 'a1' },
      { role: 'user', text: 'q3' },
      { role: 'model', text: 'a3' },
    ]);
  });

  it('keeps only the latest turns, starting with a question, within the server limits', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => [user(`q${i}`), model(`a${i}`)]).flat();
    const h = historyForRequest(msgs);
    expect(h).toHaveLength(HISTORY_MAX_TURNS);
    expect(h[0]).toEqual({ role: 'user', text: 'q7' });
    expect(h[h.length - 1]).toEqual({ role: 'model', text: 'a9' });
  });

  it('always has the order the server requires: starts with a question, alternates, ends with an answer', () => {
    // every mix of answered questions, failed questions and repeated failures, up to 8 messages
    const kinds = ['answered', 'failed', 'failedTwice'] as const;
    const build = (seq: (typeof kinds)[number][]) =>
      seq.flatMap((k, i): TutorMessage[] =>
        k === 'answered' ? [user(`q${i}`), model(`a${i}`)] : k === 'failed' ? [user(`q${i}`), error(`q${i}`)] : [user(`q${i}`), error(`q${i}`), error(`q${i}`)]
      );
    let sequences: (typeof kinds)[number][][] = [[]];
    for (let len = 0; len < 4; len++) {
      sequences = [...sequences, ...sequences.filter(s => s.length === len).flatMap(s => kinds.map(k => [...s, k]))];
    }
    for (const seq of sequences) {
      const h = historyForRequest(build(seq));
      expect(h.length % 2, seq.join(',')).toBe(0);
      h.forEach((t, i) => expect(t.role, seq.join(',')).toBe(i % 2 === 0 ? 'user' : 'model'));
    }
  });

  it('cuts each turn to the server limit', () => {
    const h = historyForRequest([user('x'.repeat(3000)), model('y'.repeat(3000))]);
    expect(h.every(t => t.text.length === HISTORY_TURN_MAX_CHARS)).toBe(true);
  });
});
