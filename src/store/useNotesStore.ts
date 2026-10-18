import { create } from 'zustand';
import { apiClient } from '../api';
import type { NoteRecord } from '../api';

interface NotesState {
  notes: NoteRecord[];
  total: number;
  isLoading: boolean;
  error: string | null;
  activeNoteId: string | null;
  searchQuery: string;
  selectedTag: string;

  fetchNotes: (params?: { search?: string; tag?: string }) => Promise<void>;
  createNote: (note: { title: string; content: string; tags?: string[]; algorithmId?: string }) => Promise<NoteRecord>;
  updateNote: (id: string, note: Partial<{ title: string; content: string; tags: string[]; algorithmId: string }>) => Promise<NoteRecord>;
  saveNote: (note: Partial<NoteRecord> & { title: string; content: string }) => Promise<NoteRecord>;
  deleteNote: (id: string) => Promise<void>;
  setActiveNoteId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTag: (tag: string) => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  total: 0,
  isLoading: false,
  error: null,
  activeNoteId: null,
  searchQuery: '',
  selectedTag: 'All',

  fetchNotes: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const search = params?.search !== undefined ? params.search : get().searchQuery;
      const tag = params?.tag !== undefined ? params.tag : get().selectedTag;

      const res = await apiClient.notes.getNotes({
        search: search || undefined,
        tag: tag !== 'All' ? tag : undefined,
        limit: 50,
      });

      set({
        notes: res.notes,
        total: res.total,
        isLoading: false,
        activeNoteId: get().activeNoteId || res.notes[0]?.id || null,
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.message || 'Failed to fetch notes. Please try again.',
      });
    }
  },

  createNote: async (note) => {
    set({ isLoading: true, error: null });
    try {
      const saved = await apiClient.notes.createNote(note);
      await get().fetchNotes();
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
      await get().fetchNotes();
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
      await get().fetchNotes();
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
    get().fetchNotes({ search: query });
  },
  setSelectedTag: (tag) => {
    set({ selectedTag: tag });
    get().fetchNotes({ tag });
  },
}));
