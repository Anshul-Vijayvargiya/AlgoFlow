import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Tag, 
  X, 
  BookOpen,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useNotesStore } from '../store/useNotesStore';
import type { NoteRecord } from '../api';

export const NotesPage: React.FC = () => {
  const {
    notes,
    isLoading,
    error,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
  } = useNotesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [editingNote, setEditingNote] = useState<NoteRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');

  // Initial fetch on mount
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const allTags = ['All', ...Array.from(new Set(notes.flatMap((n) => n.tags || [])))];

  const filteredNotes = notes.filter((note) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      note.title.toLowerCase().includes(q) ||
      note.content.toLowerCase().includes(q);
    const matchesTag = selectedTag === 'All' || (note.tags && note.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  const handleCreateNew = () => {
    setFormTitle('');
    setFormContent('');
    setFormTags('');
    setFormError(null);
    setEditingNote(null);
    setIsCreating(true);
  };

  const handleEdit = (note: NoteRecord) => {
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormTags(note.tags.join(', '));
    setFormError(null);
    setEditingNote(note);
    setIsCreating(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await deleteNote(id);
      } catch (err: any) {
        alert(err?.message || 'Failed to delete note');
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError('Title and content are required.');
      return;
    }

    const parsedTags = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingNote) {
        await updateNote(editingNote.id, {
          title: formTitle.trim(),
          content: formContent.trim(),
          tags: parsedTags.length > 0 ? parsedTags : ['General'],
        });
      } else {
        await createNote({
          title: formTitle.trim(),
          content: formContent.trim(),
          tags: parsedTags.length > 0 ? parsedTags : ['General'],
        });
      }

      setIsCreating(false);
      setEditingNote(null);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save note.');
    }
  };

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold font-mono text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-400" />
            DSA NOTES & REVISION
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Keep track of algorithm insights, edge cases, and personal solution strategies.
          </p>
        </div>

        <button
          id="notes-create-btn"
          onClick={handleCreateNew}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-xs font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all self-start md:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Note
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0B0F19] p-4 rounded-2xl border border-cyan-500/15">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            id="notes-search-input"
            type="text"
            placeholder="Search notes content or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          <Tag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1 rounded-lg text-xs font-mono shrink-0 transition-all cursor-pointer ${
                selectedTag === tag
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {isLoading && notes.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <span className="text-xs font-mono text-slate-400">Loading your persistent notes...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-3xl p-12 text-center space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-mono font-bold text-slate-300">No notes found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || selectedTag !== 'All'
              ? 'No notes match your current search query or tag filter.'
              : 'You have not created any algorithm notes yet. Click "Create Note" to capture your first insight.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-cyan-500/40 transition-all duration-300 shadow-xl group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {note.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEdit(note)}
                      className="p-1 rounded bg-slate-900 text-slate-400 hover:text-cyan-400 cursor-pointer"
                      title="Edit Note"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="p-1 rounded bg-slate-900 text-slate-400 hover:text-rose-400 cursor-pointer"
                      title="Delete Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {note.content}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/60">
                <div className="flex flex-wrap gap-1.5">
                  {note.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
                <div className="text-[10px] font-mono text-slate-500 text-right">
                  Updated: {new Date(note.updatedAt).toISOString().split('T')[0]}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreating && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-[#0B0F19] border border-cyan-500/30 rounded-3xl w-full max-w-xl p-6 space-y-4 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold font-mono text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-cyan-400" />
              {editingNote ? 'Edit Note' : 'Create New Note'}
            </h2>

            {formError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-mono">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">Title:</label>
              <input
                id="note-modal-title"
                type="text"
                required
                maxLength={120}
                placeholder="e.g. Binary Search Pattern"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">Tags (comma separated):</label>
              <input
                id="note-modal-tags"
                type="text"
                placeholder="Sorting, Arrays, Edge Cases"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">Content:</label>
              <textarea
                id="note-modal-content"
                required
                rows={5}
                maxLength={10000}
                placeholder="Write your detailed algorithm note, invariants, formulas, or tricky edge cases..."
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 bg-slate-900 text-slate-400 rounded-xl text-xs font-mono cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="note-modal-save-btn"
                type="submit"
                className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-xs font-mono font-bold shadow-lg shadow-cyan-500/20 cursor-pointer"
              >
                Save Note
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
