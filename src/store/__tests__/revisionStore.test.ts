import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, type RevisionRecord, type UserProfile } from '../../api';
import { HttpError } from '../../api/httpAdapter';
import { useAuthStore } from '../useAuthStore';
import { revisionCounts, useRevisionStore } from '../useRevisionStore';

// The list shared by the badge, the page and the bookmark, with the API scripted.
const s = () => useRevisionStore.getState();
const record = (algorithmId: string, over: Partial<RevisionRecord> = {}): RevisionRecord => ({
  algorithmId, status: 'pending', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...over,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let getRevisions: ReturnType<typeof vi.spyOn>;
let markForRevision: ReturnType<typeof vi.spyOn>;
let setRevisionStatus: ReturnType<typeof vi.spyOn>;
let removeRevision: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  s().reset();
  getRevisions = vi.spyOn(apiClient.revisions, 'getRevisions').mockResolvedValue([]);
  markForRevision = vi.spyOn(apiClient.revisions, 'markForRevision').mockImplementation(async (id, reason) => record(id, { reason: reason ?? undefined }));
  setRevisionStatus = vi.spyOn(apiClient.revisions, 'setRevisionStatus').mockImplementation(async (id, status) => record(id, { status }));
  removeRevision = vi.spyOn(apiClient.revisions, 'removeRevision').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

describe('loading', () => {
  it('loads once: the header, the page and the bookmark asking together share one request, and later asks send none', async () => {
    getRevisions.mockResolvedValue([record('quick-sort')]);
    await Promise.all([s().load(), s().load(), s().load()]);
    await s().load();
    expect(getRevisions).toHaveBeenCalledTimes(1);
    expect(s()).toMatchObject({ status: 'ready', items: [{ algorithmId: 'quick-sort' }], error: null });
  });

  it('a failed load is reported, and Retry loads again', async () => {
    getRevisions.mockRejectedValueOnce(new Error('Network down'));
    await s().load();
    expect(s()).toMatchObject({ status: 'error', error: 'Network down', items: [] });
    await s().load({ force: true });
    expect(getRevisions).toHaveBeenCalledTimes(2);
    expect(s()).toMatchObject({ status: 'ready', error: null });
  });

  it('a change waits for a load in flight, so the load cannot overwrite it', async () => {
    const pending = deferred<RevisionRecord[]>();
    getRevisions.mockReturnValue(pending.promise);
    const load = s().load();
    const mark = s().mark('heap-sort', null);
    expect(markForRevision).not.toHaveBeenCalled();
    pending.resolve([record('quick-sort')]);
    await Promise.all([load, mark]);
    expect(s().items.map(r => r.algorithmId)).toEqual(['heap-sort', 'quick-sort']);
  });
});

describe('changes', () => {
  beforeEach(async () => {
    getRevisions.mockResolvedValue([record('quick-sort'), record('merge-sort', { status: 'revised' })]);
    await s().load();
  });

  it('marking adds it to the top; the counts follow', async () => {
    await s().mark('heap-sort', 'forgot-the-logic');
    expect(markForRevision).toHaveBeenCalledWith('heap-sort', 'forgot-the-logic');
    expect(s().items[0]).toMatchObject({ algorithmId: 'heap-sort', reason: 'forgot-the-logic' });
    expect(revisionCounts(s().items)).toEqual({ total: 3, pending: 2, revised: 1 });
  });

  it('marking one already there replaces it: never a duplicate', async () => {
    await s().mark('quick-sort', 'need-more-practice');
    expect(s().items.filter(r => r.algorithmId === 'quick-sort')).toHaveLength(1);
    expect(s().items[0].reason).toBe('need-more-practice');
  });

  it('pending → revised and revised → pending move the counts and keep the record', async () => {
    await s().setStatus('quick-sort', 'revised');
    expect(revisionCounts(s().items)).toEqual({ total: 2, pending: 0, revised: 2 });
    await s().setStatus('merge-sort', 'pending');
    expect(revisionCounts(s().items)).toEqual({ total: 2, pending: 1, revised: 1 });
  });

  it('removing takes it off the list', async () => {
    await s().remove('quick-sort');
    expect(removeRevision).toHaveBeenCalledWith('quick-sort');
    expect(s().items.map(r => r.algorithmId)).toEqual(['merge-sort']);
  });

  it('a failed change rejects and changes nothing', async () => {
    const before = s().items;
    markForRevision.mockRejectedValueOnce(new Error('nope'));
    setRevisionStatus.mockRejectedValueOnce(new Error('nope'));
    removeRevision.mockRejectedValueOnce(new Error('nope'));
    await expect(s().mark('heap-sort', null)).rejects.toThrow('nope');
    await expect(s().setStatus('quick-sort', 'revised')).rejects.toThrow('nope');
    await expect(s().remove('quick-sort')).rejects.toThrow('nope');
    expect(s().items).toEqual(before);
    expect(s().busy).toEqual([]);
  });

  it('the algorithm is busy only while its change is in flight', async () => {
    const pending = deferred<RevisionRecord>();
    setRevisionStatus.mockReturnValueOnce(pending.promise);
    const change = s().setStatus('quick-sort', 'revised');
    expect(s().busy).toEqual(['quick-sort']);
    pending.resolve(record('quick-sort', { status: 'revised' }));
    await change;
    expect(s().busy).toEqual([]);
  });

  it('removed in another tab: removing here succeeds, and a status change reports it and drops the card', async () => {
    const gone = () => new HttpError('This algorithm is not on your Revision List.', 404);
    removeRevision.mockRejectedValueOnce(gone());
    await s().remove('quick-sort');
    expect(s().items.map(r => r.algorithmId)).toEqual(['merge-sort']);
    setRevisionStatus.mockRejectedValueOnce(gone());
    await expect(s().setStatus('merge-sort', 'pending')).rejects.toThrow('not on your Revision List');
    expect(s().items).toEqual([]);
  });
});

describe('accounts', () => {
  const user = (id: string) => ({ id, name: id, email: `${id}@example.test` }) as UserProfile;

  it('signing out or switching account forgets the list, and the next load is for the new account', async () => {
    useAuthStore.setState({ user: user('alice') });
    getRevisions.mockResolvedValue([record('quick-sort')]);
    await s().load();
    useAuthStore.setState({ user: user('bob') });
    expect(s()).toMatchObject({ items: [], status: 'idle' });
    getRevisions.mockResolvedValue([]);
    await s().load();
    expect(getRevisions).toHaveBeenCalledTimes(2);
    expect(s().items).toEqual([]);
    useAuthStore.setState({ user: null });
    expect(s().status).toBe('idle');
  });

  it('a response for the previous account is dropped', async () => {
    useAuthStore.setState({ user: user('alice') });
    const pending = deferred<RevisionRecord[]>();
    getRevisions.mockReturnValue(pending.promise);
    const load = s().load();
    useAuthStore.setState({ user: user('bob') });
    pending.resolve([record('quick-sort')]);
    await load;
    expect(s().items).toEqual([]);
    expect(s().status).toBe('idle');
    useAuthStore.setState({ user: null });
  });
});
