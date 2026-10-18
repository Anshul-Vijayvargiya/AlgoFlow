import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ExecutionFailure } from '../../engine/buildExecution';

interface ExecutionErrorCardProps {
  error: ExecutionFailure;
}

/** Shown when a trace fails to generate. This is a defect, not a "coming soon" state. */
export const ExecutionErrorCard: React.FC<ExecutionErrorCardProps> = ({ error }) => (
  <div
    role="alert"
    className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0B0F19]/80 border border-rose-500/30 rounded-3xl shadow-2xl my-4"
  >
    <AlertTriangle className="w-10 h-10 text-rose-400 mb-3" />
    <h2 className="text-lg font-bold font-mono text-white">Visualization unavailable</h2>
    <p className="text-sm text-slate-400 mt-2 max-w-md">{error.message}</p>
    <p className="text-xs text-slate-500 mt-1">Try selecting another algorithm or reloading the page.</p>
    {import.meta.env.DEV && error.detail && (
      <pre className="mt-4 max-w-xl text-left text-[11px] font-mono text-rose-300 bg-slate-950 border border-rose-500/20 rounded-lg p-3 whitespace-pre-wrap">
        [{error.kind}] {error.detail}
      </pre>
    )}
  </div>
);
