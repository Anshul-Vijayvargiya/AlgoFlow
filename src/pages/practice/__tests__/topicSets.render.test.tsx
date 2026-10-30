import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { TopicSet } from '../topicSets';

// The Practice page's topic learning sets in each state. Static rendering reads a store's initial state, so the
// Practice store is replaced by a plain object holding the state under test (as in the Dashboard render tests).
const store = vi.hoisted(() => ({
  problems: [], total: 0, currentPage: 1, totalPages: 1, pageSize: 12, isLoading: false, error: null as string | null,
  topicSets: [] as TopicSet[], topicSetsStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error', topicSetsError: null as string | null,
  topicSetsIncomplete: false,
  selectedLanguage: 'cpp', userCode: '', isSubmitting: false, submissionResult: null, submissionError: null, draftsNotSaved: false,
  submissions: [], selectedDifficulty: 'All', selectedTopic: 'All', searchQuery: '',
  fetchProblems: () => Promise.resolve(), fetchTopicSets: () => Promise.resolve(), selectProblem: () => {}, setLanguage: () => {},
  setUserCode: () => {}, submitSolution: () => Promise.resolve(), setPage: () => {}, setSelectedDifficulty: () => {},
  setSelectedTopic: () => {}, setSearchQuery: () => {},
}));
vi.mock('../../../store/usePracticeStore', () => ({ usePracticeStore: () => store }));

const { PracticePage } = await import('../../PracticePage');
const render = () => renderToStaticMarkup(<MemoryRouter><PracticePage /></MemoryRouter>);

const set = (topic: string, total: number, solved: number): TopicSet => ({ topic, total, solved, byDifficulty: { Easy: total, Medium: 0, Hard: 0 } });
const LOADED = [set('Arrays', 2, 1), set('Trees', 1, 0)];

beforeEach(() => {
  Object.assign(store, { topicSets: [], topicSetsStatus: 'idle', topicSetsError: null, topicSetsIncomplete: false, selectedTopic: 'All' });
});

describe('Practice page — topic learning sets', () => {
  it('loading: a status message, no sets and no invented counts', () => {
    store.topicSetsStatus = 'loading';
    const html = render();
    expect(html).toContain('data-testid="topic-sets-loading"');
    expect(html).not.toContain('data-topic-set=');
  });

  it('loaded: "All topics" plus one button per set, with counts, solved progress and the selected one pressed', () => {
    Object.assign(store, { topicSetsStatus: 'ready', topicSets: LOADED, selectedTopic: 'Arrays' });
    const html = render();
    expect([...html.matchAll(/data-topic-set="([^"]+)"/g)].map(m => m[1])).toEqual(['All', 'Arrays', 'Trees']);
    expect(html).toMatch(/data-topic-set="Arrays" aria-pressed="true"/);
    expect(html).toMatch(/data-topic-set="All" aria-pressed="false"/);
    // All topics: 3 problems, 1 solved; Arrays: 1 of 2; Trees: 0 of 1
    expect(html).toContain('3 problems');
    expect(html).toContain('1 of 3 solved');
    expect(html).toContain('1 of 2 solved');
    expect(html).toContain('0 of 1 solved');
    // the topic filter offers exactly the same topics
    expect([...html.matchAll(/<option value="([^"]+)"/g)].map(m => m[1])).toEqual(['All', 'Arrays', 'Trees']);
  });

  it('first load failed: the error with Retry, and no sets', () => {
    Object.assign(store, { topicSetsStatus: 'error', topicSetsError: 'Network error.' });
    const html = render();
    expect(html).toContain('data-testid="topic-sets-error"');
    expect(html).toContain('The topic sets could not be loaded: Network error.');
    expect(html).toContain('>Retry</button>');
    expect(html).not.toContain('data-topic-set=');
    expect(html).not.toContain('data-testid="topic-sets-loading"');
  });

  it('a refresh failed: the sets loaded earlier stay, with a notice and Retry', () => {
    Object.assign(store, { topicSetsStatus: 'error', topicSetsError: 'Network error.', topicSets: LOADED });
    const html = render();
    expect(html).toContain('The topic sets could not be refreshed; showing what was loaded earlier. Network error.');
    expect([...html.matchAll(/data-topic-set="([^"]+)"/g)].map(m => m[1])).toEqual(['All', 'Arrays', 'Trees']);
  });

  it('no published problems: an empty state, not an error and not invented sets', () => {
    store.topicSetsStatus = 'ready';
    const html = render();
    expect(html).toContain('data-testid="topic-sets-empty"');
    expect(html).not.toContain('data-topic-set=');
    expect(html).not.toContain('data-testid="topic-sets-error"');
  });

  it('counts capped: a notice that they may be incomplete', () => {
    Object.assign(store, { topicSetsStatus: 'ready', topicSets: LOADED, topicSetsIncomplete: true });
    expect(render()).toContain('their counts may be incomplete');
  });

  it('a selected topic not among the sets (e.g. while they load) still shows in the filter, never a wrong value', () => {
    Object.assign(store, { topicSetsStatus: 'loading', selectedTopic: 'Graphs' });
    expect([...render().matchAll(/<option value="([^"]+)"/g)].map(m => m[1])).toEqual(['All', 'Graphs']);
  });
});
