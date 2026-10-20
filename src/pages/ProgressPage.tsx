import React, { useEffect } from 'react';
import { 
  BarChart2, 
  Trophy, 
  Flame, 
  CheckCircle2, 
  Brain, 
  TrendingUp, 
  Award,
  Loader2
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar 
} from 'recharts';
import { useChartColors } from '../theme/chartColors';
import { useProgressStore } from '../store/useProgressStore';

export const ProgressPage: React.FC = () => {
  const chart = useChartColors();
  const { progress, isLoading, fetchProgress } = useProgressStore();

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Use real persisted progress or defaults
  const streakDays = progress?.streakDays ?? 0;
  const solvedCount = progress?.solvedCount ?? 0;
  const algorithmsLearned = progress?.algorithmsLearned ?? 0;
  const overallProgressPercent = progress?.overallProgressPercent ?? 0;

  const weeklyActivity = progress?.weeklyActivity?.length
    ? progress.weeklyActivity
    : [
        { day: 'Mon', steps: 0, minutes: 0 },
        { day: 'Tue', steps: 0, minutes: 0 },
        { day: 'Wed', steps: 0, minutes: 0 },
        { day: 'Thu', steps: 0, minutes: 0 },
        { day: 'Fri', steps: 0, minutes: 0 },
        { day: 'Sat', steps: 0, minutes: 0 },
        { day: 'Sun', steps: 0, minutes: 0 },
      ];

  const topicData = progress?.topicProficiency?.length
    ? progress.topicProficiency
    : [
        { topic: 'Sorting', score: 0 },
        { topic: 'Searching', score: 0 },
        { topic: 'Arrays', score: 0 },
        { topic: 'Trees', score: 0 },
        { topic: 'Graphs', score: 0 },
        { topic: 'DP', score: 0 },
      ];

  return (
    <div className="min-h-screen bg-page text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="border-b border-slate-800 pb-6 space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
          <BarChart2 className="w-3.5 h-3.5" />
          ANALYTICS & PROGRESS
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold font-mono text-ink">
            Learning Mastery Analytics
          </h1>
          {isLoading && (
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Syncing progress...</span>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 max-w-2xl">
          Track your algorithmic execution steps, problem solving frequency, and topic proficiency over time.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Progress */}
        <div className="bg-surface border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Overall Progress</span>
            <Trophy className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-ink">
            {overallProgressPercent}%
          </div>
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-cyan-500 to-purple-500 h-full transition-all duration-500"
              style={{ width: `${overallProgressPercent}%` }}
            />
          </div>
        </div>

        {/* Mastered Algorithms */}
        <div className="bg-surface border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Algorithms Mastered</span>
            <Brain className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-cyan-300">
            {algorithmsLearned} / 26
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {overallProgressPercent}% platform coverage
          </div>
        </div>

        {/* Problems Solved */}
        <div className="bg-surface border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Problems Solved</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-400">
            {solvedCount}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Verified submissions
          </div>
        </div>

        {/* Active Streak */}
        <div className="bg-surface border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Active Streak</span>
            <Flame className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-amber-400">
            {streakDays} {streakDays === 1 ? 'Day' : 'Days'}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {streakDays > 0 ? 'Consecutive daily activity 🔥' : 'Start learning today to build streak!'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-surface border border-cyan-500/15 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                CUMULATIVE ALGORITHM EXECUTIONS
              </h3>
              <p className="text-xs text-slate-500">Steps visualized & code lines executed over the past 7 days</p>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyActivity}>
                <defs>
                  <linearGradient id="colorSteps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.primary} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={chart.primary} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke={chart.axis} fontSize={11} />
                <YAxis stroke={chart.axis} fontSize={11} />
                <Tooltip contentStyle={chart.tooltip} />
                <Area type="monotone" dataKey="steps" stroke={chart.primary} strokeWidth={3} fillOpacity={1} fill="url(#colorSteps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface border border-cyan-500/15 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-400" />
            TOPIC PROFICIENCY
          </h3>
          <div className="h-72 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={topicData}>
                <PolarGrid stroke={chart.grid} />
                <PolarAngleAxis dataKey="topic" stroke={chart.polarAngle} fontSize={11} />
                <PolarRadiusAxis stroke={chart.polarRadius} fontSize={9} domain={[0, 100]} />
                <Radar name="Proficiency" dataKey="score" stroke={chart.radar} fill={chart.radar} fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
