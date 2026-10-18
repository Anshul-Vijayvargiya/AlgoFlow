import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Play, 
  Sparkles, 
  Code2, 
  Flame, 
  Trophy, 
  BookOpen, 
  ArrowRight, 
  CheckCircle2, 
  TrendingUp 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

import { useProgressStore } from '../store/useProgressStore';
import { useAuthStore } from '../store/useAuthStore';

export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { progress, fetchProgress } = useProgressStore();

  React.useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const weeklyData = progress?.weeklyActivity?.length
    ? progress.weeklyActivity
    : [
        { day: 'Mon', minutes: 0, steps: 0 },
        { day: 'Tue', minutes: 0, steps: 0 },
        { day: 'Wed', minutes: 0, steps: 0 },
        { day: 'Thu', minutes: 0, steps: 0 },
        { day: 'Fri', minutes: 0, steps: 0 },
        { day: 'Sat', minutes: 0, steps: 0 },
        { day: 'Sun', minutes: 0, steps: 0 },
      ];

  const difficultyData = progress?.difficultyDistribution?.length
    ? progress.difficultyDistribution
    : [
        { name: 'Easy', value: 0, color: '#10B981' },
        { name: 'Medium', value: 0, color: '#F59E0B' },
        { name: 'Hard', value: 0, color: '#F43F5E' },
      ];

  const streakDays = progress?.streakDays ?? user?.streakDays ?? 0;
  const solvedCount = progress?.solvedCount ?? user?.solvedCount ?? 0;
  const algorithmsLearned = progress?.algorithmsLearned ?? user?.algorithmsLearned ?? 0;
  const progressPercent = progress?.overallProgressPercent ?? user?.progressPercent ?? 0;


  const recommendedAlgs = [
    { id: 'bubble-sort', name: 'Bubble Sort', category: 'SORTING', time: 'O(n²)', diff: 'Easy' },
    { id: 'binary-search', name: 'Binary Search', category: 'SEARCHING', time: 'O(log n)', diff: 'Easy' },
    { id: 'quick-sort', name: 'Quick Sort', category: 'SORTING', time: 'O(n log n)', diff: 'Medium' },
    { id: 'two-pointer', name: 'Two Pointer', category: 'ARRAYS', time: 'O(n)', diff: 'Easy' },
  ];

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-200 p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="relative rounded-3xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-purple-950/40 border border-cyan-500/20 p-6 md:p-10 overflow-hidden shadow-2xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            CORE USP: WATCH ALGORITHMS EXECUTE LIVE
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white font-sans">
            Master DSA by <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">Watching It Execute</span>
          </h1>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            Understand algorithms through synchronized code, live vertical visualizations and line-by-line step explanations.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <NavLink
              to="/visualizer"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-sm font-bold shadow-lg shadow-cyan-500/25 flex items-center gap-2 transition-all hover:scale-105"
            >
              <Play className="w-4 h-4 fill-white" />
              Launch Visualizer
            </NavLink>
            <NavLink
              to="/practice"
              className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-cyan-500/40 text-slate-200 font-mono text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Code2 className="w-4 h-4 text-cyan-400" />
              Start Practice
            </NavLink>
          </div>
        </div>
      </div>

      {/* Stats Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Solved */}
        <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{solvedCount}</div>
            <div className="text-xs text-slate-400">Problems Solved</div>
          </div>
        </div>

        {/* Card 2: Algorithms Learned */}
        <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{algorithmsLearned}</div>
            <div className="text-xs text-slate-400">Algorithms Learned</div>
          </div>
        </div>

        {/* Card 3: Streak */}
        <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {streakDays} {streakDays === 1 ? 'Day' : 'Days'}
            </div>
            <div className="text-xs text-slate-400">Current Streak 🔥</div>
          </div>
        </div>

        {/* Card 4: Learning Progress */}
        <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-purple-300">{progressPercent}%</div>
            <div className="text-xs text-slate-400">Learning Progress</div>
          </div>
        </div>
      </div>


      {/* Main Grid: Continue Learning + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Continue Learning & Activity Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Continue Learning Card */}
          <div className="bg-[#0B0F19] border border-cyan-500/20 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                CONTINUE LEARNING
              </span>
              <h3 className="text-lg font-bold text-white">Bubble Sort & Array Partitioning</h3>
              <p className="text-xs text-slate-400">
                Step 4 of 10 executed. Pick up right where you left off.
              </p>
            </div>
            <NavLink
              to="/visualizer"
              className="px-4 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-mono font-bold flex items-center gap-2 shrink-0 transition-colors"
            >
              Resume Step 4
              <ArrowRight className="w-4 h-4" />
            </NavLink>
          </div>

          {/* Weekly Activity Chart */}
          <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  WEEKLY PRACTICE ACTIVITY
                </h3>
                <p className="text-xs text-slate-500">Minutes spent watching & coding</p>
              </div>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded">
                Total: 7.4 hrs
              </span>
            </div>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <XAxis dataKey="day" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC', fontSize: '12px' }}
                  />
                  <Bar dataKey="minutes" fill="#38BDF8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Difficulty Distribution & Recommended */}
        <div className="space-y-6">
          {/* Difficulty Distribution Chart */}
          <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">
              DIFFICULTY DISTRIBUTION
            </h3>
            <div className="h-44 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={difficultyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {difficultyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-around text-xs font-mono">
              {difficultyData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-slate-400">{d.name}:</span>
                  <span className="text-white font-bold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Algorithms */}
          <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-6 shadow-xl space-y-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">
              RECOMMENDED ALGORITHMS
            </h3>
            <div className="space-y-2">
              {recommendedAlgs.map((alg) => (
                <NavLink
                  key={alg.id}
                  to="/visualizer"
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 flex items-center justify-between text-xs transition-colors group"
                >
                  <div>
                    <div className="font-bold text-slate-200 group-hover:text-cyan-300">
                      {alg.name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {alg.category} • {alg.time}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400">
                    {alg.diff}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
