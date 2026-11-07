import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { RevisionRecord } from '../../../api';
import { REVISION_REASONS, revisionReasonLabel } from '../../../data/revisions';
import { filterRevisions, revisedPercent, toRevisionRow } from '../revisionData';

// server rendering reads a Zustand store's initial state, so the store is scripted here, as in the other render tests
const store = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));
vi.mock('../../../store/useRevisionStore', async importOriginal => {
  const original = await importOriginal<typeof import('../../../store/useRevisionStore')>();
  const useRevisionStore = (selector?: (s: unknown) => unknown) => (selector ? selector(store.state) : store.state);
  useRevisionStore.getState = () => store.state;
  return { revisionCounts: original.revisionCounts, useRevisionStore };
});

const { RevisionBookmark } = await import('../../../components/visualizer/RevisionBookmark');
const { RevisionPage } = await import('../../RevisionPage');

// The Revision page and the Visualizer's bookmark for each state of the store, and the filter and search together.
const record = (algorithmId: string, over: Partial<RevisionRecord> = {}): RevisionRecord => ({
  algorithmId, status: 'pending', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...over,
});
const page = () => renderToStaticMarkup(<MemoryRouter><RevisionPage /></MemoryRouter>).replace(/<!-- -->/g, '');
const bookmark = () => renderToStaticMarkup(<RevisionBookmark algorithmId="quick-sort" algorithmName="Quick Sort" />);
const LIST = [
  record('quick-sort', { reason: 'forgot-the-logic' }),
  record('merge-sort', { status: 'revised', revisedAt: '2026-11-02T00:00:00.000Z' }),
  record('binary-search', { reason: 'interview-preparation' }),
];

const setStore = (over: { status: string; items?: RevisionRecord[]; error?: string }) => Object.assign(store.state, over);

beforeEach(() => {
  store.state = { items: [], status: 'idle', error: null, busy: [], load: async () => {}, mark: async () => {}, setStatus: async () => {}, remove: async () => {} };
});

describe('filterRevisions', () => {
  const rows = LIST.map(toRevisionRow);
  const names = (filter: 'all' | 'pending' | 'revised', search = '') => filterRevisions(rows, filter, search).map(r => r.algorithmId);

  it('each status filter', () => {
    expect(names('all')).toEqual(['quick-sort', 'merge-sort', 'binary-search']);
    expect(names('pending')).toEqual(['quick-sort', 'binary-search']);
    expect(names('revised')).toEqual(['merge-sort']);
  });

  it('search matches the name, ignoring case and surrounding spaces', () => {
    expect(names('all', '  SORT ')).toEqual(['quick-sort', 'merge-sort']);
    expect(names('all', 'zzz')).toEqual([]);
  });

  it('filter and search together', () => {
    expect(names('pending', 'sort')).toEqual(['quick-sort']);
    expect(names('revised', 'quick')).toEqual([]);
  });

  it('a search is plain text, not a pattern', () => {
    expect(names('all', '.*')).toEqual([]);
  });
});

describe('revisedPercent', () => {
  it('a whole percent of the list', () => {
    expect(revisedPercent(0, 3)).toBe(0);
    expect(revisedPercent(1, 3)).toBe(33);
    expect(revisedPercent(2, 3)).toBe(67);
    expect(revisedPercent(3, 3)).toBe(100);
  });

  it('never rounds up to 100 while something is still pending, and an empty list is 0', () => {
    expect(revisedPercent(199, 200)).toBe(99);
    expect(revisedPercent(0, 0)).toBe(0);
  });
});

describe('RevisionPage', () => {
  it('title and subtitle', () => {
    const html = page();
    expect(html).toContain('Revision List</h1>');
    expect(html).toContain('Algorithms you&#x27;ve marked to revise later.');
  });

  it('while loading: a loading state, no empty state', () => {
    setStore({ status: 'loading' });
    const html = page();
    expect(html).toContain('data-testid="revision-loading"');
    expect(html).not.toContain('data-testid="revision-empty"');
  });

  it('a failed load: the error and Retry, never the empty state', () => {
    setStore({ status: 'error', error: 'Could not reach the server.' });
    const html = page();
    expect(html).toContain('Could not reach the server.');
    expect(html).toContain('Retry');
    expect(html).not.toContain('data-testid="revision-empty"');
  });

  it('nothing marked: explains how, and links to the Visualizer', () => {
    setStore({ status: 'ready', items: [] });
    const html = page();
    expect(html).toContain('data-testid="revision-empty"');
    expect(html).toContain('Mark for Revision');
    expect(html).toMatch(/href="\/visualizer"/);
    expect(html).not.toContain('data-testid="revision-progress"');
  });

  it('counts beside the filters and in the progress come from the records', () => {
    setStore({ status: 'ready', items: LIST });
    const html = page();
    expect(html).toMatch(/data-testid="revision-filter-all"[^>]*>All \(3\)/);
    expect(html).toMatch(/data-testid="revision-filter-pending"[^>]*>Pending \(2\)/);
    expect(html).toMatch(/data-testid="revision-filter-revised"[^>]*>Revised \(1\)/);
    expect(html).toMatch(/data-testid="revision-stat-pending"[^>]*>2</);
    expect(html).toMatch(/data-testid="revision-stat-revised"[^>]*>1</);
    expect(html).toMatch(/data-testid="revision-stat-total"[^>]*>3</);
    expect(html).toContain('aria-label="1 of 3 revised, 2 pending"');
    expect(html).toContain('aria-label="33% revised"');
    expect(html).toContain('stroke-dasharray="33 100"');
    expect(html).toContain('1 of 3 algorithms revised');
  });

  it('nothing revised yet: the ring has no arc and says 0%', () => {
    setStore({ status: 'ready', items: [record('quick-sort')] });
    const html = page();
    expect(html).toContain('aria-label="0% revised"');
    expect(html).not.toContain('revision-ring-arc');
    expect(html).toContain('0 of 1 algorithm revised');
  });

  it('the hero shows in every state; the stats and progress only with a list', () => {
    for (const state of ['loading', 'error'] as const) {
      setStore({ status: state, error: 'Could not reach the server.' });
      expect(page()).toContain('data-testid="revision-hero"');
      expect(page()).not.toContain('data-testid="revision-stat-total"');
    }
  });

  it('a pending card: name, category, reason, Pending, Revise Now to the Visualizer', () => {
    setStore({ status: 'ready', items: [record('quick-sort', { reason: 'forgot-the-logic' })] });
    const html = page();
    expect(html).toContain('Quick Sort</h2>');
    expect(html).toContain('Sorting');
    expect(html).toContain('Forgot the logic');
    expect(html).toMatch(/data-status="pending"/);
    expect(html).toMatch(/href="\/visualizer"[^>]*aria-label="Revise Now: Quick Sort"|aria-label="Revise Now: Quick Sort"[^>]*href="\/visualizer"/);
    expect(html).not.toContain('Revise Again');
    expect(html).toContain('aria-label="Mark as Revised: Quick Sort"');
    expect(html).toContain('aria-label="Remove from Revision: Quick Sort"');
  });

  it('a revised card: Revised, Revise Again, no Revise Now, says no reason when there is none', () => {
    setStore({ status: 'ready', items: [record('merge-sort', { status: 'revised', revisedAt: '2026-11-02T00:00:00.000Z' })] });
    const html = page();
    expect(html).toMatch(/data-status="revised"/);
    expect(html).toContain('aria-label="Revise Again: Merge Sort"');
    expect(html).not.toContain('Revise Now');
    expect(html).not.toContain('aria-label="Mark as Revised');
    expect(html).toContain('aria-label="Remove from Revision: Merge Sort"');
    expect(html).toContain('No reason given');
    expect(html).toContain('Revised on');
  });

  it('every reason has its label; an unknown one has none', () => {
    for (const r of REVISION_REASONS) expect(revisionReasonLabel(r.id)).toBe(r.label);
    expect(revisionReasonLabel(undefined)).toBeNull();
  });
});

describe('RevisionBookmark', () => {
  it('unmarked: Mark for Revision', () => {
    setStore({ status: 'ready', items: [] });
    const html = bookmark();
    expect(html).toContain('aria-label="Mark for Revision"');
    expect(html).toContain('data-marked="false"');
  });

  it('marked: Added to Revision, whatever its status', () => {
    setStore({ status: 'ready', items: [record('quick-sort', { status: 'revised' })] });
    const html = bookmark();
    expect(html).toContain('aria-label="Added to Revision"');
    expect(html).toContain('data-marked="true"');
  });

  it('another algorithm\'s record does not mark this one', () => {
    setStore({ status: 'ready', items: [record('merge-sort')] });
    expect(bookmark()).toContain('data-marked="false"');
  });

  it('while the list loads it cannot say yet: disabled', () => {
    setStore({ status: 'loading' });
    expect(bookmark()).toMatch(/<button[^>]*disabled/);
  });

  it('the form is closed until pressed', () => {
    setStore({ status: 'ready', items: [] });
    expect(bookmark()).not.toContain('data-testid="revision-form"');
  });
});
