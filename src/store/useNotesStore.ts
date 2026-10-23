import { create } from 'zustand';
import { apiClient } from '../api';
import type { NoteRecord } from '../api';
import { useAuthStore } from './useAuthStore';

/** notes per page (the server allows up to 50) */
export const NOTES_PAGE_SIZE = 20;

interface NotesState {
  /** the current page of the current search / tag, as the server returned it */
  notes: NoteRecord[];
  /** notes matching the current search / tag, across all pages */
  total: number;
  page: number;
  totalPages: number;
  /** every tag the user has used (not only those on this page) */
  tags: string[];
  isLoading: boolean;
  error: string | null;
  activeNoteId: string | null;
  searchQuery: string;
  selectedTag: string;

  /** loads a page (default: the current one) of the current search and tag */
  fetchNotes: (params?: { page?: number }) => Promise<void>;
  fetchTags: () => Promise<void>;
  setPage: (page: number) => Promise<void>;
  createNote: (note: { title: string; content: string; tags?: string[]; algorithmId?: string }) => Promise<NoteRecord>;
  updateNote: (id: string, note: Partial<{ title: string; content: string; tags: string[]; algorithmId: string }>) => Promise<NoteRecord>;
  saveNote: (note: Partial<NoteRecord> & { title: string; content: string }) => Promise<NoteRecord>;
  deleteNote: (id: string) => Promise<void>;
  setActiveNoteId: (id: string | null) => void;
  /** a new search or tag starts again from the first page */
  setSearchQuery: (query: string) => Promise<void>;
  setSelectedTag: (tag: string) => Promise<void>;
  reset: () => void;
}

const INITIAL = {
  notes: [] as NoteRecord[],
  total: 0,
  page: 1,
  totalPages: 1,
  tags: [] as string[],
  isLoading: false,
  error: null,
  activeNoteId: null,
  searchQuery: '',
  selectedTag: 'All',
};

// only the latest list request may update the list (typing a search sends several)
let listRequest = 0;

export const useNotesStore = create<NotesState>((set, get) => ({
  ...INITIAL,

  fetchNotes: async (params) => {
    const ticket = ++listRequest;
    const page = params?.page ?? get().page;
    set({ isLoading: true, error: null });
    try {
      const { searchQuery, selectedTag } = get();
      const res = await apiClient.notes.getNotes({
        page,
        limit: NOTES_PAGE_SIZE,
        search: searchQuery.trim() || undefined,
        tag: selectedTag !== 'All' ? selectedTag : undefined,
      });
      if (ticket !== listRequest) return;
      set({
        notes: res.notes,
        total: res.total,
        page: res.page,
        totalPages: res.totalPages,
        isLoading: false,
        activeNoteId: get().activeNoteId || res.notes[0]?.id || null,
      });
    } catch (err: any) {
      if (ticket !== listRequest) return;
      set({
        isLoading: false,
        error: err?.message || 'Failed to fetch notes. Please try again.',
      });
    }
  },

  fetchTags: async () => {
    try {
      set({ tags: await apiClient.notes.getTags() });
    } catch {
      // the tag filter keeps its earlier list; the notes list reports errors
    }
  },

  setPage: (page) => get().fetchNotes({ page }),

  createNote: async (note) => {
    set({ isLoading: true, error: null });
    try {
      const saved = await apiClient.notes.createNote(note);
      // newest first: the new note is on the first page
      await Promise.all([get().fetchNotes({ page: 1 }), get().fetchTags()]);
      set({ activeNoteId: saved.id, isLoading: false });
      return saved;
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'Failed to create note.' });
      throw err;
    }
  },

  updateNote: async (id, note) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await apiClient.notes.updateNote(id, note);
      // an edit moves the note to the top: show the first page, where it now is
      await Promise.all([get().fetchNotes({ page: 1 }), get().fetchTags()]);
      set({ activeNoteId: updated.id, isLoading: false });
      return updated;
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'Failed to update note.' });
      throw err;
    }
  },

  saveNote: async (note) => {
    if (note.id) {
      return get().updateNote(note.id, note);
    }
    return get().createNote(note);
  },

  deleteNote: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.notes.deleteNote(id);
      await Promise.all([get().fetchNotes(), get().fetchTags()]);
      // deleting the last note of the last page: show the page before it
      if (get().notes.length === 0 && get().page > 1) await get().fetchNotes({ page: get().totalPages });
      const remaining = get().notes;
      set({
        activeNoteId: remaining.length > 0 ? remaining[0].id : null,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'Failed to delete note.' });
      throw err;
    }
  },

  setActiveNoteId: (id) => set({ activeNoteId: id }),
  setSearchQuery: (query) => {
    set({ searchQuery: query });
    return get().fetchNotes({ page: 1 });
  },
  setSelectedTag: (tag) => {
    set({ selectedTag: tag });
    return get().fetchNotes({ page: 1 });
  },
  reset: () => {
    listRequest++;
    set({ ...INITIAL });
  },
}));

// notes belong to one account: drop them when it signs out or another one signs in
useAuthStore.subscribe((state, previous) => {
  if (previous.user && state.user?.id !== previous.user.id) useNotesStore.getState().reset();
});
