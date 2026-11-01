import React from 'react';
import { Layers } from 'lucide-react';
import type { TopicProgressItem } from './dashboardData';

interface Props {
  status: 'loading' | 'ready';
  topics: TopicProgressItem[];
  className: string;
  headingClass: string;
}

/**
 * Your progress by algorithm topic: per category of the app (Sorting, Searching, Trees…), how many of its visualizable
 * algorithms the learner has stepped through, and how many they completed. Counts come from their own tracks.
 */
export const TopicProgress: React.FC<Props> = ({ status, topics, className, headingClass }) => {
  const explored = topics.reduce((n, t) => n + t.explored, 0);
  return (
    <section aria-labelledby="topics-heading" data-testid="topic-progress" className={`${className} p-5 space-y-4`}>
      <div className="space-y-1">
        <h2 id="topics-heading" className={headingClass}>
          <Layers className="w-4 h-4 text-purple-400" aria-hidden="true" />
          Your progress by topic
        </h2>
        <p className="text-[11px] text-slate-400">Algorithms you have stepped through in the visualizer, out of those it can show.</p>
      </div>
      {status === 'loading' ? (
        <div aria-hidden="true" className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 w-full rounded-lg bg-slate-800/70 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <ul className="space-y-3" data-testid="topic-list">
            {topics.map(t => (
              <li key={t.topic} data-topic={t.topic} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-200 truncate">{t.topic}</span>
                  <span className="font-mono text-slate-300 shrink-0" data-testid="topic-count">
                    {t.explored} / {t.implemented}
                    {t.completed > 0 && <span className="text-emerald-300"> · {t.completed} completed</span>}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${t.topic} explored`}
                  aria-valuemin={0}
                  aria-valuemax={t.implemented}
                  aria-valuenow={t.explored}
                  aria-valuetext={`${t.explored} of ${t.implemented} ${t.topic} algorithms explored${t.completed ? `, ${t.completed} completed` : ''}`}
                  className="h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden"
                >
                  <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400" style={{ width: `${t.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {explored === 0 && (
            <p data-testid="topic-empty" className="text-xs text-slate-400">
              Nothing explored yet: step through any algorithm in the visualizer and its topic fills in here.
            </p>
          )}
        </>
      )}
    </section>
  );
};
