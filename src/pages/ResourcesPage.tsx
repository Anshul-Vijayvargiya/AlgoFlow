import React from 'react';
import { Library } from 'lucide-react';
import { DownloadableNotes } from './resources/DownloadableNotes';

/**
 * Resources (/resources): downloadable reference material for study, such as the SQL Notes PDF. Kept apart from the
 * Notes page (/notes), which holds the learner's own notes.
 */
export const ResourcesPage: React.FC = () => (
  <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
    <div className="border-b border-slate-800 pb-6">
      <h1 className="text-[30px] leading-tight font-bold font-mono text-ink flex items-center gap-2.5">
        <Library className="w-7 h-7 text-cyan-400 shrink-0" aria-hidden="true" />
        STUDY RESOURCES
      </h1>
      <p className="text-base text-slate-400 mt-2">Reference notes to preview in your browser or download for offline revision.</p>
    </div>
    <DownloadableNotes />
  </div>
);
