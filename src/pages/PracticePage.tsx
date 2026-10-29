import React, { useEffect, useState } from 'react';
import { 
  Code2, 
  Search, 
  CheckCircle2, 
  Play, 
  X, 
  Terminal,
  Check,
  Loader2,
  History,
  AlertTriangle,
  RotateCcw,
  Layers
} from 'lucide-react';
import { usePracticeStore } from '../store/usePracticeStore';
import { TONE_PANEL, TONE_TEXT, verdictOf } from './practice/verdicts';
import { solvedPercent } from './practice/topicSets';
import type { PracticeProblem, ProgrammingLanguage } from '../types/algorithm';

export const PracticePage: React.FC = () => {
  const {
    problems,
    total,
    currentPage,
    totalPages,
    pageSize,
    isLoading,
    error,
    topicSets,
    topicSetsStatus,
    topicSetsError,
    topicSetsIncomplete,
    fetchTopicSets,
    selectedLanguage,
    userCode,
    isSubmitting,
    submissionResult,
    submissionError,
    draftsNotSaved,
    submissions,
    selectedDifficulty,
    selectedTopic,
    searchQuery,
    fetchProblems,
    selectProblem,
    setLanguage,
    setUserCode,
    submitSolution,
    setPage,
    setSelectedDifficulty,
    setSelectedTopic,
    setSearchQuery,
  } = usePracticeStore();

  const [activeModalProblem, setActiveModalProblem] = useState<PracticeProblem | null>(null);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  useEffect(() => {
    fetchTopicSets();
  }, [fetchTopicSets]);

  const difficulties = ['All', 'Easy', 'Medium', 'Hard'];
  // the topics the published problems actually have (plus the selected one, so the filter never shows a wrong value)
  const topics = ['All', ...topicSets.map(t => t.topic)];
  if (!topics.includes(selectedTopic)) topics.push(selectedTopic);
  const allProblems = topicSets.reduce((n, t) => n + t.total, 0);
  const allSolved = topicSets.reduce((n, t) => n + t.solved, 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const handleOpenProblem = (prob: PracticeProblem) => {
    setActiveModalProblem(prob);
    selectProblem(prob);
  };

  const handleCloseModal = () => {
    setActiveModalProblem(null);
  };

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-[30px] leading-tight font-bold font-mono text-ink flex items-center gap-2.5">
            <Code2 className="w-7 h-7 text-cyan-400 shrink-0" />
            CODING PRACTICE
          </h1>
          <p className="text-base text-slate-400 mt-2">
            Solve curated DSA problems with persistent attempt tracking and execution traces.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="practice-search-input"
            type="text"
            placeholder="Search problems or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-base font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Topic learning sets: the published problems grouped by topic; choosing one sets the same topic filter as below */}
      <section aria-labelledby="topic-sets-heading" data-testid="topic-sets" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="topic-sets-heading" className="text-xl font-semibold font-mono text-ink flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" aria-hidden="true" />
              Topic learning sets
            </h2>
            <p className="text-base text-slate-400 mt-1">
              Work through one topic at a time. Solved counts include only accepted solutions.
            </p>
          </div>
        </div>

        {topicSetsStatus === 'error' && (
          <div role="alert" data-testid="topic-sets-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              {topicSets.length > 0
                ? `The topic sets could not be refreshed; showing what was loaded earlier. ${topicSetsError}`
                : `The topic sets could not be loaded: ${topicSetsError}`}
            </span>
            <button
              type="button"
              onClick={() => fetchTopicSets()}
              className="font-mono font-bold underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Retry
            </button>
          </div>
        )}
        {topicSetsStatus === 'error' && topicSets.length === 0 ? null : topicSetsStatus !== 'ready' && topicSetsStatus !== 'error' ? (
          <p role="status" data-testid="topic-sets-loading" className="text-sm font-mono text-slate-400">
            Loading topic sets…
          </p>
        ) : topicSets.length === 0 ? (
          <p data-testid="topic-sets-empty" className="text-sm text-slate-400">
            No topic sets yet: no practice problems have been published.
          </p>
        ) : (
          <div role="group" aria-label="Topic learning sets" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[{ topic: 'All', label: 'All topics', total: allProblems, solved: allSolved, byDifficulty: null }, ...topicSets.map(t => ({ ...t, label: t.topic }))].map(set => {
              const active = selectedTopic === set.topic;
              const percent = solvedPercent(set);
              const levels = set.byDifficulty
                ? (['Easy', 'Medium', 'Hard'] as const).filter(d => set.byDifficulty![d] > 0).map(d => `${set.byDifficulty![d]} ${d}`).join(' · ')
                : null;
              return (
                <button
                  key={set.topic}
                  type="button"
                  data-topic-set={set.topic}
                  aria-pressed={active}
                  onClick={() => setSelectedTopic(set.topic)}
                  className={`text-left rounded-2xl border p-4 space-y-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    active ? 'bg-cyan-500/15 border-cyan-500/50' : 'bg-surface border-slate-800 hover:border-cyan-500/40'
                  }`}
                >
                  <span className={`block break-words text-lg leading-snug font-semibold ${active ? 'text-cyan-300' : 'text-ink'}`}>{set.label}</span>
                  <span className="block text-sm font-mono text-slate-400">{plural(set.total, 'problem')}</span>
                  {levels && <span className="block text-sm font-mono text-slate-400">{levels}</span>}
                  <span className="block text-sm font-mono text-slate-300">
                    {set.solved} of {set.total} solved
                  </span>
                  <span aria-hidden="true" className="block h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <span className="block h-full bg-emerald-400" style={{ width: `${percent}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {topicSetsIncomplete && (
          <p className="text-sm text-amber-300">There are more problems than the topic sets could read; their counts may be incomplete.</p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-2xl border border-cyan-500/15">
        {/* wraps on narrow screens, so the larger buttons never push the page sideways */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-mono text-slate-400">Difficulty:</span>
          <div className="flex flex-wrap gap-1.5">
            {difficulties.map((diff) => (
              <button
                key={diff}
                type="button"
                aria-pressed={selectedDifficulty === diff}
                onClick={() => setSelectedDifficulty(diff)}
                className={`px-3.5 py-1.5 rounded-lg text-[15px] font-mono transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  selectedDifficulty === diff
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="practice-topic-select" className="text-[15px] font-mono text-slate-400">Topic:</label>
          <select
            id="practice-topic-select"
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-[15px] font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {topics.map((t) => (
              <option key={t} value={t}>{t === 'All' ? 'All topics' : t}</option>
            ))}
          </select>
        </div>
      </div>

      {error && problems.length > 0 && (
        <div role="status" data-testid="practice-refresh-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Couldn&apos;t refresh the problems. Showing what was loaded earlier.</span>
          <button type="button" onClick={() => fetchProblems()} className="font-mono font-bold underline underline-offset-2">Retry</button>
        </div>
      )}

      {error && problems.length === 0 ? (
        <div role="alert" data-testid="practice-error" className="bg-surface border border-rose-500/40 rounded-3xl p-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" aria-hidden="true" />
          <div className="flex-1 space-y-1">
            <h2 className="text-base font-bold text-ink">The problems could not be loaded</h2>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchProblems()}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-mono font-bold flex items-center gap-2 hover:border-cyan-500/50 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            {isLoading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : isLoading && problems.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <span className="text-sm font-mono text-slate-400">Loading curated problem collection...</span>
        </div>
      ) : problems.length === 0 ? (
        <div className="bg-surface border border-cyan-500/15 rounded-3xl p-12 text-center space-y-3">
          <Code2 className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-xl font-mono font-semibold text-slate-300">No problems found</h3>
          <p className="text-base leading-[1.6] text-slate-500 max-w-sm mx-auto">
            No published problems match your search, difficulty and topic filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {problems.map((prob) => {
            let diffColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            if (prob.difficulty === 'Medium') diffColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            if (prob.difficulty === 'Hard') diffColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';

            return (
              <div
                key={prob.id}
                data-problem={prob.id}
                className="bg-surface border border-cyan-500/15 rounded-2xl p-6 flex flex-col justify-between space-y-5 hover:border-cyan-500/40 transition-all duration-300 shadow-lg group min-w-0"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] font-mono font-bold px-2.5 py-0.5 rounded border ${diffColor}`}>
                      {prob.difficulty}
                    </span>
                    {prob.solved ? (
                      <span className="flex items-center gap-1 text-sm font-mono text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        Solved
                      </span>
                    ) : (
                      <span className="text-sm font-mono text-slate-500">Unsolved</span>
                    )}
                  </div>

                  {/* long titles wrap; the description is a 3-line preview of the full statement */}
                  <h3 className="break-words text-xl leading-snug font-semibold text-ink group-hover:text-cyan-300 transition-colors">
                    {prob.title}
                  </h3>
                  <p className="break-words text-base leading-[1.6] text-slate-400 line-clamp-3">
                    {prob.description}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {prob.tags.map((tag) => (
                      <span key={tag} className="text-[13px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleOpenProblem(prob)}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 hover:from-cyan-500/30 hover:to-blue-600/30 border border-cyan-500/40 text-cyan-300 rounded-xl text-[15px] font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  Practice Now
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!error && total > 0 && (
        <nav aria-label="Practice problem pages" data-testid="practice-pagination" className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-surface px-4 py-3">
          <p className="text-sm font-mono text-slate-400" aria-live="polite">
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total} problems
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="practice-previous-page"
              onClick={() => setPage(currentPage - 1)}
              disabled={isLoading || currentPage <= 1}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-mono text-slate-200 hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="min-w-20 text-center text-sm font-mono text-slate-300" data-testid="practice-page-indicator">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              data-testid="practice-next-page"
              onClick={() => setPage(currentPage + 1)}
              disabled={isLoading || currentPage >= totalPages}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-mono text-slate-200 hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      )}

      {/* Problem Workspace & Submission Modal */}
      {activeModalProblem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-cyan-500/30 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl relative">
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-ink cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded border border-cyan-500/20">
                {activeModalProblem.category} • {activeModalProblem.difficulty}
              </span>
              <h2 className="text-2xl font-bold font-mono text-ink">
                {activeModalProblem.title}
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line" data-testid="problem-statement">
                {activeModalProblem.description}
              </p>
              {activeModalProblem.autoJudged ? (
                <p className="text-[11px] font-mono text-slate-400">
                  Submissions are judged by running your program on these sample tests and on hidden tests.
                </p>
              ) : (
                <p role="note" data-testid="not-auto-judged" className="text-[11px] font-mono text-amber-300">
                  This problem is not set up for automatic judging: submitting records your attempt without a verdict.
                </p>
              )}
            </div>

            {/* Test Cases */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                SAMPLE TEST CASES
              </div>
              {activeModalProblem.testCases.map((tc, idx) => (
                <div key={idx} data-testid="sample-test" className="grid grid-cols-2 gap-3 py-1 border-b border-slate-800/50">
                  <div>
                    <span className="text-slate-400 text-[10px]">Input</span>
                    <pre className="text-slate-300 whitespace-pre-wrap">{tc.input}</pre>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Expected output</span>
                    <pre className="text-cyan-400 font-bold whitespace-pre-wrap">{tc.expected || '(empty)'}</pre>
                  </div>
                </div>
              ))}
            </div>

            {/* Workspace & Code Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span>Implementation Workspace</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {(['cpp', 'c', 'java', 'python'] as ProgrammingLanguage[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer transition-all ${
                        selectedLanguage === lang
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                rows={8}
                className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-cyan-200 focus:outline-none focus:border-cyan-500/50 resize-y"
                placeholder="Write your solution here..."
              />
              {draftsNotSaved && (
                <p role="status" data-testid="drafts-not-saved" className="text-[11px] font-mono text-amber-300">
                  Your draft could not be saved on this device (storage is full or blocked). It is kept until you reload the page.
                </p>
              )}
            </div>

            {/* Attempt History */}
            {submissions.length > 0 && (
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800/80 space-y-2">
                <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5 font-bold">
                  <History className="w-3.5 h-3.5 text-cyan-400" />
                  Your Submission History ({submissions.length})
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {submissions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-[11px] font-mono bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800/50"
                    >
                      <span className="text-cyan-300 uppercase">{s.language}</span>
                      <span className={TONE_TEXT[verdictOf(s.status).tone]} data-testid="history-status">
                        {verdictOf(s.status).label}
                        {s.testsTotal !== undefined && ` · ${s.testsPassed ?? 0}/${s.testsTotal}`}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submission Status Message */}
            {submissionResult ? (
              <div
                role="status"
                data-testid="submission-result"
                data-status={submissionResult.status}
                className={`p-4 border rounded-xl text-xs font-mono space-y-3 ${TONE_PANEL[verdictOf(submissionResult.status).tone]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className={`flex items-center gap-2 text-sm font-bold ${TONE_TEXT[verdictOf(submissionResult.status).tone]}`}>
                      {submissionResult.passed ? <Check className="w-4 h-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />}
                      <span data-testid="submission-verdict">{verdictOf(submissionResult.status).label}</span>
                    </div>
                    <p className="text-slate-300" data-testid="submission-message">{submissionResult.message}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => usePracticeStore.setState({ submissionResult: null })}
                      className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg cursor-pointer"
                    >
                      Edit &amp; resubmit
                    </button>
                    <button
                      onClick={handleCloseModal}
                      className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 rounded-lg cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
                {submissionResult.failedTest && !submissionResult.failedTest.hidden && (
                  <div data-testid="failed-test" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px]">Input (test {submissionResult.failedTest.number})</span>
                      <pre className="text-slate-300 whitespace-pre-wrap">{submissionResult.failedTest.input}</pre>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Expected output</span>
                      <pre className="text-emerald-300 whitespace-pre-wrap">{submissionResult.failedTest.expected || '(empty)'}</pre>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Your output</span>
                      <pre className="text-rose-300 whitespace-pre-wrap">{submissionResult.failedTest.actual || '(no output)'}</pre>
                    </div>
                    {submissionResult.failedTest.stderr && (
                      <div className="sm:col-span-3">
                        <span className="text-slate-400 text-[10px]">Errors (stderr)</span>
                        <pre className="text-amber-300 whitespace-pre-wrap">{submissionResult.failedTest.stderr}</pre>
                      </div>
                    )}
                  </div>
                )}
                {submissionResult.failedTest?.hidden && (
                  <p data-testid="failed-hidden-test" className="text-slate-300">
                    Hidden test {submissionResult.failedTest.number} failed. Hidden tests&apos; inputs are not shown.
                  </p>
                )}
                {submissionResult.compileOutput && (
                  <div>
                    <span className="text-slate-400 text-[10px]">Compiler output</span>
                    <pre data-testid="submission-compile-output" className="text-rose-300 whitespace-pre-wrap">{submissionResult.compileOutput}</pre>
                  </div>
                )}
              </div>
            ) : submissionError ? (
              <div role="alert" data-testid="submission-error" className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-mono flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Not submitted: {submissionError}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCloseModal} className="px-3 py-1 bg-slate-900 text-slate-300 rounded-lg cursor-pointer">Cancel</button>
                  <button onClick={submitSolution} disabled={isSubmitting} className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-lg cursor-pointer flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-slate-900 text-slate-400 rounded-xl text-xs font-mono cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="practice-submit-btn"
                  onClick={submitSolution}
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-mono font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {activeModalProblem.autoJudged ? 'Judging…' : 'Recording Attempt...'}
                    </>
                  ) : (
                    'Submit Solution'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
