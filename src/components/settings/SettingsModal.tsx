import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  User, 
  Code2, 
  Clock, 
  Palette, 
  Shield, 
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { apiClient } from '../../api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, fetchCurrentUser } = useAuthStore();

  const [name, setName] = useState(user?.name || '');
  const [preferredLanguage, setPreferredLanguage] = useState<'cpp' | 'c' | 'java' | 'python'>(
    user?.preferences?.preferredLanguage || 'cpp'
  );
  const [theme, setTheme] = useState<'dark' | 'system'>(user?.preferences?.theme || 'dark');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(
    user?.preferences?.dailyGoalMinutes || 30
  );

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiClient.settings.updateProfile({
        name: name.trim(),
        preferences: {
          preferredLanguage,
          theme,
          dailyGoalMinutes: Number(dailyGoalMinutes),
        },
      });

      await fetchCurrentUser();
      setSuccessMessage('Settings updated successfully!');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0B0F19] border border-cyan-500/30 rounded-3xl w-full max-w-lg p-6 space-y-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-mono text-white">Account Settings</h2>
            <p className="text-xs text-slate-400">
              Manage your display profile and learning preferences.
            </p>
          </div>
        </div>

        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-mono">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4 text-xs font-mono">
          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              Display Name
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Email (Read only) */}
          <div className="space-y-1.5">
            <label className="text-slate-400 flex items-center gap-1.5">
              Email Address (Immutable)
            </label>
            <input
              type="text"
              disabled
              value={user.email}
              className="w-full bg-slate-900/50 border border-slate-800/60 rounded-xl px-3 py-2 text-slate-500 cursor-not-allowed"
            />
          </div>

          {/* Preferred Language */}
          <div className="space-y-1.5">
            <label className="text-slate-400 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              Default Programming Language
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['cpp', 'c', 'java', 'python'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setPreferredLanguage(lang)}
                  className={`py-2 rounded-xl text-center font-bold transition-all cursor-pointer ${
                    preferredLanguage === lang
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Goal */}
          <div className="space-y-1.5">
            <label className="text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Daily Learning Goal
              </span>
              <span className="text-cyan-300 font-bold">{dailyGoalMinutes} min/day</span>
            </label>
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <label className="text-slate-400 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              Interface Theme
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`py-2 rounded-xl text-center font-bold capitalize transition-all cursor-pointer ${
                    theme === t
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {t} Mode
                </button>
              ))}
            </div>
          </div>

          {/* Security & Role Badges */}
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300">Account Authorization</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20">
                {user.accountStatus}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[10px] border border-cyan-500/20">
                {user.role}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 text-slate-400 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
