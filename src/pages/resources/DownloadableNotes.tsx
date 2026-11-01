import React from 'react';
import { AlertTriangle, Download, Eye, FileText, Library } from 'lucide-react';
import { LEARNING_RESOURCES, checkResource, fileSizeText, resourceUrl, type LearningResource } from '../../data/learningResources';

const action =
  'flex-1 min-w-[8.5rem] px-3 py-2 rounded-lg text-xs font-mono font-bold inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';

/** one resource: what it covers, its format and size, and Preview / Download (disabled with a reason if the file is missing) */
const ResourceItem: React.FC<{ resource: LearningResource }> = ({ resource: r }) => {
  const url = resourceUrl(r);
  const [state, setState] = React.useState<'checking' | 'ready' | 'missing'>('checking');
  React.useEffect(() => {
    let live = true;
    checkResource(url).then(ok => {
      if (live) setState(ok ? 'ready' : 'missing');
    });
    return () => {
      live = false;
    };
  }, [url]);
  const meta = `${r.format} · ${r.pages} pages · ${fileSizeText(r.sizeBytes)}`;

  return (
    <li data-resource={r.id} data-state={state} className="flex flex-col gap-3 bg-surface border border-cyan-500/15 rounded-2xl p-5 shadow-xl min-w-0">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl border border-purple-400/30 bg-purple-500/10 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-purple-300" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-bold text-ink">{r.title}</h3>
          <p className="text-[11px] font-mono text-cyan-300" data-testid="resource-meta">
            {meta}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">{r.description}</p>

      {state === 'missing' ? (
        <div role="status" data-testid="resource-missing" className="mt-auto flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          These notes are unavailable right now. Please try again later.
        </div>
      ) : (
        <div className="mt-auto flex flex-wrap gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            type="application/pdf"
            data-testid="resource-preview"
            aria-label={`Preview Notes: ${r.title} (${r.format}, opens in a new tab)`}
            className={`${action} bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-500/50`}
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            Preview Notes
          </a>
          <a
            href={url}
            download={r.downloadName}
            type="application/pdf"
            data-testid="resource-download"
            aria-label={`Download PDF: ${r.title} (${fileSizeText(r.sizeBytes)})`}
            className={`${action} bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30`}
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download PDF
          </a>
        </div>
      )}
    </li>
  );
};

/**
 * Downloadable notes on the Resources page (the navbar's Resources item): reference PDFs that are public static files
 * in public/downloads/ (src/data/learningResources.ts). One card per file, in a grid.
 */
export const DownloadableNotes: React.FC = () => (
  <section aria-labelledby="downloadable-notes-heading" data-testid="downloadable-notes" className="space-y-3">
    <div className="space-y-1">
      <h2 id="downloadable-notes-heading" className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
        <Library className="w-4 h-4 text-purple-400" aria-hidden="true" />
        Downloadable notes
      </h2>
      <p className="text-sm text-slate-400">Reference PDFs to preview in your browser or keep for offline revision.</p>
    </div>
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="downloadable-notes-list">
      {LEARNING_RESOURCES.map(r => (
        <ResourceItem key={r.id} resource={r} />
      ))}
    </ul>
  </section>
);
