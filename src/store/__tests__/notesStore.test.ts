import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, type NoteRecord, type UserProfile } from '../../api';
import { useAuthStore } from '../useAuthStore';
import { NOTES_PAGE_SIZE, useNotesStore } from '../useNotesStore';

const note = (id: string, tags: string[] = []): NoteRecord => ({ id, title: `Note ${id}`, content: 'c', tags, createdAt: '', updatedAt: '' });
const page = (notes: NoteRecord[], p: number, total: number) => ({ notes, total, page: p, limit: NOTES_PAGE_SIZE, totalPages: Math.ceil(total / NOTES_PAGE_SIZE) || 1 });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as UserProfile });
  useNotesStore.getState().reset();
  vi.spyOn(apiClient.notes, 'getTags').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe('notes store — paging and filtering on the server', () => {
  it('asks the server for one page with the current search and tag', async () => {
    const getNotes = vi.spyOn(apiClient.notes, 'getNotes').mockResolvedValue(page([note('a')], 2, 45));
    useNotesStore.setState({ searchQuery: ' graphs ', selectedTag: 'BFS' });
    await useNotesStore.getState().setPage(2);
    expect(getNotes).toHaveBeenCalledWith({ page: 2, limit: NOTES_PAGE_SIZE, search: 'graphs', tag: 'BFS' });
    expect(useNotesStore.getState()).toMatchObject({ page: 2, total: 45, totalPages: 3 });
  });

  it('a new search or tag starts again from the first page', async () => {
    const getNotes = vi.spyOn(apiClient.notes, 'getNotes').mockResolvedValue(page([], 1, 0));
    useNotesStore.setState({ page: 3 });
    await useNotesStore.getState().setSearchQuery('heap');
    expect(getNotes).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'heap' }));
    useNotesStore.setState({ page: 2 });
    await useNotesStore.getState().setSelectedTag('All');
    expect(getNotes).toHaveBeenLastCalledWith({ page: 1, limit: NOTES_PAGE_SIZE, search: 'heap', tag: undefined });
  });

  it('only the latest request updates the list (an older search answering late is dropped)', async () => {
    const slow = deferred<ReturnType<typeof page>>();
    vi.spyOn(apiClient.notes, 'getNotes').mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page([note('new')], 1, 1));
    const first = useNotesStore.getState().setSearchQuery('h');
    await useNotesStore.getState().setSearchQuery('heap');
    slow.resolve(page([note('old')], 1, 1));
    await first;
    expect(useNotesStore.getState().notes.map(n => n.id)).toEqual(['new']);
  });

  it('the tag list comes from all notes, not the loaded page', async () => {
    vi.spyOn(apiClient.notes, 'getTags').mockResolvedValue(['Arrays', 'Graphs', 'Trees']);
    await useNotesStore.getState().fetchTags();
    expect(useNotesStore.getState().tags).toEqual(['Arrays', 'Graphs', 'Trees']);
  });

  it('deleting the last note of the last page shows the page before it', async () => {
    vi.spyOn(apiClient.notes, 'deleteNote').mockResolvedValue();
    const getNotes = vi.spyOn(apiClient.notes, 'getNotes').mockResolvedValueOnce(page([], 3, 40)).mockResolvedValueOnce(page([note('x')], 2, 40));
    useNotesStore.setState({ page: 3 });
    await useNotesStore.getState().deleteNote('gone');
    expect(getNotes.mock.calls.map(c => c[0]?.page)).toEqual([3, 2]);
    expect(useNotesStore.getState()).toMatchObject({ page: 2, notes: [note('x')] });
  });

  it('a new note shows the first page, where it is (newest first)', async () => {
    vi.spyOn(apiClient.notes, 'createNote').mockResolvedValue(note('fresh'));
    const getNotes = vi.spyOn(apiClient.notes, 'getNotes').mockResolvedValue(page([note('fresh')], 1, 21));
    useNotesStore.setState({ page: 2 });
    await useNotesStore.getState().createNote({ title: 't', content: 'c' });
    expect(getNotes).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('a failure is reported and keeps the earlier page', async () => {
    vi.spyOn(apiClient.notes, 'getNotes').mockResolvedValueOnce(page([note('a')], 1, 1)).mockRejectedValueOnce(new Error('Invalid query parameters.'));
    await useNotesStore.getState().fetchNotes();
    await useNotesStore.getState().setPage(2);
    expect(useNotesStore.getState()).toMatchObject({ error: 'Invalid query parameters.', notes: [note('a')] });
  });

  it("signing out or switching account drops the previous user's notes, search and tags", async () => {
    vi.spyOn(apiClient.notes, 'getNotes').mockResolvedValue(page([note('mine', ['Secret'])], 1, 1));
    vi.spyOn(apiClient.notes, 'getTags').mockResolvedValue(['Secret']);
    await useNotesStore.getState().setSearchQuery('private');
    await useNotesStore.getState().fetchTags();
    useAuthStore.setState({ user: { id: 'u2' } as UserProfile });
    expect(useNotesStore.getState()).toMatchObject({ notes: [], tags: [], searchQuery: '', page: 1, total: 0 });
  });
});
