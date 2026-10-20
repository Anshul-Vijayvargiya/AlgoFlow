import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Play,
  Code2,
  Sparkles,
  Brain,
  FileText,
  BarChart2,
  Globe,
  ChevronDown,
  Bot,
  Compass,
  Terminal,
  LogOut,
  Settings,
  User,
  Shield,
  Flame,
  Trophy,
} from 'lucide-react';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { useAuthStore } from '../../store/useAuthStore';
import { AITutorDrawer } from '../ai/AITutorDrawer';
import { SettingsModal } from '../settings/SettingsModal';
import { ThemeSelect } from '../theme/ThemeSelect';
import type { ProgrammingLanguage } from '../../types/algorithm';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const Header: React.FC = () => {
  const { selectedLanguage, setLanguage } = useVisualizerStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileModal(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const navItems = [
    { to: '/dashboard',  label: 'Dashboard',  icon: Sparkles   },
    { to: '/visualizer', label: 'Visualizer',  icon: Play       },
    { to: '/practice',   label: 'Practice',    icon: Code2      },
    { to: '/playground', label: 'Playground',  icon: Terminal   },
    { to: '/learning',   label: 'Roadmap',     icon: Compass    },
    { to: '/patterns',   label: 'Patterns',    icon: Brain      },
    { to: '/notes',      label: 'Notes',       icon: FileText   },
    { to: '/progress',   label: 'Progress',    icon: BarChart2  },
  ];

  const languages: { id: ProgrammingLanguage; label: string }[] = [
    { id: 'cpp',    label: 'C++'    },
    { id: 'c',      label: 'C'      },
    { id: 'java',   label: 'Java'   },
    { id: 'python', label: 'Python' },
  ];

  async function handleLogout() {
    setShowProfileModal(false);
    await logout();
    navigate('/auth', { replace: true });
  }

  const initials = user ? getInitials(user.name) : 'AF';
  const displayName = user ? user.name.split(' ')[0] : 'Guest';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';


  return (
    <>
      <header className="h-16 bg-[#070A12]/90 light:bg-page/90 backdrop-blur-md border-b border-cyan-500/15 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sticky top-0 z-40">
        {/* Brand Logo */}
        <NavLink to="/dashboard" className="flex items-center gap-3 group min-w-0 shrink">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full bg-page rounded-[10px] flex items-center justify-center">
              <Play className="w-4 h-4 text-cyan-400 fill-cyan-400/20 ml-0.5" />
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="truncate font-bold text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 font-mono">
              AlgoFlow
            </span>
            <span className="truncate text-[10px] tracking-widest uppercase text-cyan-400/70 light:text-cyan-400 font-mono -mt-1">
              Production DSA Platform
            </span>
          </div>
        </NavLink>

        {/* Main Navigation */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/80">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Top Right Quick Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* AI Tutor Button */}
          <button
            id="header-ai-tutor-btn"
            onClick={() => setAiDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-purple-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 text-xs font-mono font-bold shadow-sm transition-all"
            title="Open AI DSA Tutor"
            aria-label="AI Tutor"
          >
            <Bot className="w-4 h-4 text-cyan-400" />
            {/* icon only where the full navigation leaves little room (as on phones); it keeps its aria-label */}
            <span className="hidden sm:inline lg:max-2xl:hidden">AI Tutor</span>
          </button>

          {/* Theme (Dark / Light / System), shared with Settings */}
          <ThemeSelect id="header-theme-select" compact />

          {/* Language Selector */}
          <div className="relative flex items-center bg-slate-900/80 border border-slate-700/60 rounded-lg px-2.5 py-1">
            <Globe className="w-3.5 h-3.5 text-cyan-400 mr-1.5" />
            <select
              id="header-language-select"
              aria-label="Programming language"
              value={selectedLanguage}
              onChange={(e) => setLanguage(e.target.value as ProgrammingLanguage)}
              className="h-6 bg-transparent text-xs font-mono text-cyan-200 cursor-pointer rounded pr-1"
            >
              {languages.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-slate-900 text-slate-200">
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Profile / Auth Button */}
          <div className="relative" ref={profileRef}>
            {user ? (
              <>
                <button
                  id="header-profile-btn"
                  aria-haspopup="menu"
                  aria-expanded={showProfileModal}
                  onClick={() => setShowProfileModal(!showProfileModal)}
                  className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:border-cyan-500/50 transition-all text-xs font-mono text-slate-300"
                >
                  {/* Avatar */}
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                    {initials}
                  </div>
                  <span className="hidden sm:inline max-w-[80px] truncate">{displayName}</span>
                  {/* the visible name is hidden on phones; keep it in the accessible name there too */}
                  <span className="sr-only sm:hidden">{displayName}</span>
                  {isAdmin && (
                    <span title="Admin">
                      <Shield className="w-3 h-3 text-amber-400" />
                    </span>
                  )}
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showProfileModal ? 'rotate-180' : ''}`} />
                </button>

                {/* Profile Dropdown */}
                {showProfileModal && (
                  <div className="absolute right-0 top-12 w-64 bg-slate-900/95 backdrop-blur-xl border border-cyan-500/20 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
                    {/* User info */}
                    <div className="p-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm shadow">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-ink truncate">{user.name}</div>
                          <div className="text-xs text-slate-400 truncate">{user.email}</div>
                          {isAdmin && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Shield className="w-3 h-3 text-amber-400" />
                              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">Admin</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="p-3 grid grid-cols-2 gap-2 border-b border-slate-800">
                      <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="text-xs text-slate-400">Streak</div>
                          <div className="text-sm font-bold text-amber-400 font-mono">{user.streakDays}d</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                        <Trophy className="w-4 h-4 text-cyan-400" />
                        <div>
                          <div className="text-xs text-slate-400">Solved</div>
                          <div className="text-sm font-bold text-cyan-400 font-mono">{user.solvedCount}</div>
                        </div>
                      </div>
                    </div>

                    {/* Menu items */}
                    <div className="p-2 space-y-0.5">
                      <button
                        onClick={() => { setShowProfileModal(false); navigate('/progress'); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-ink transition-colors"
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        My Profile
                      </button>
                      <button
                        id="header-settings-btn"
                        onClick={() => {
                          setShowProfileModal(false);
                          setSettingsModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-ink transition-colors cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        Settings
                      </button>
                      {isAdmin && (
                        <button
                          id="header-admin-console-btn"
                          onClick={() => {
                            setShowProfileModal(false);
                            navigate('/admin');
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
                        >
                          <Shield className="w-4 h-4 text-amber-400" />
                          Admin Console
                        </button>
                      )}
                      <div className="h-px bg-slate-800 my-1" />
                      <button
                        id="header-logout-btn"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Not logged in */
              <button
                id="header-login-btn"
                onClick={() => navigate('/auth')}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/40 text-cyan-300 hover:border-cyan-400/60 text-xs font-mono font-semibold transition-all"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

      {/* AI Tutor Drawer Overlay */}
      <AITutorDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </>
  );
};

