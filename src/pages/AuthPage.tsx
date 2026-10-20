import React, { useState, useEffect, useId } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Play,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  Code2,
  Brain,
  BarChart2,
  AlertCircle,
  Loader2,
  Check,
  Info,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { ThemeSelect } from '../components/theme/ThemeSelect';

// ── Constants ─────────────────────────────────────────────────────────────

type AuthMode = 'login' | 'register';

const IS_DEV = import.meta.env.DEV;

const FEATURES = [
  { icon: Play,      label: 'Interactive Algorithm Visualizer', color: 'from-cyan-500 to-blue-500' },
  { icon: Code2,     label: 'Multi-Language Practice Arena',    color: 'from-blue-500 to-purple-500' },
  { icon: Brain,     label: 'AI-Powered DSA Tutor',            color: 'from-purple-500 to-pink-500' },
  { icon: BarChart2, label: 'Progress Tracking & Analytics',   color: 'from-pink-500 to-cyan-500' },
];

/** Password requirement descriptors */
const PW_RULES = [
  { label: 'At least 8 characters',  test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter (A–Z)',  test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter (a–z)',  test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number (0–9)',            test: (p: string) => /[0-9]/.test(p) },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function FloatingOrb({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute rounded-full blur-3xl opacity-20 animate-pulse pointer-events-none ${className}`}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isLoading, error, clearError, user } = useAuthStore();

  // Stable IDs for aria linking
  const nameId     = useId();
  const emailId    = useId();
  const passwordId = useId();
  const errorId    = useId();
  const pwHintId   = useId();

  // Determine initial mode from query param (?mode=register)
  const params = new URLSearchParams(location.search);
  const [mode, setMode] = useState<AuthMode>(
    params.get('mode') === 'register' ? 'register' : 'login'
  );

  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location.state]);

  // Clear errors when switching modes; reset fields
  useEffect(() => {
    clearError();
    setFieldErrors({});
    setName('');
    setPassword('');
    setShowPass(false);
  }, [mode, clearError]);

  // ── Validation ─────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (mode === 'register' && !name.trim()) {
      errs.name = 'Full name is required.';
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'A valid email address is required.';
    }
    if (mode === 'login' && password.length === 0) {
      errs.password = 'Password is required.';
    }
    if (mode === 'register' && !PW_RULES.every((r) => r.test(password))) {
      errs.password = 'Password does not meet all requirements.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return; // prevent duplicate submissions
    if (!validate()) return;

    let ok: boolean;
    if (mode === 'login') {
      ok = await login(email, password);
    } else {
      ok = await register(name, email, password);
    }

    if (ok) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }

  // ── Password requirements ──────────────────────────────────────────────
  const pwSatisfied = PW_RULES.map((r) => r.test(password));
  const allPwSatisfied = pwSatisfied.every(Boolean);

  return (
    <div className="min-h-screen bg-page flex overflow-x-hidden">

      {/* ── Left Panel: Branding (hidden on mobile / tablet) ── */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden flex-col items-center justify-center p-12 xl:p-16"
        aria-hidden="true"
      >
        {/* Animated background orbs */}
        <FloatingOrb className="w-96 h-96 bg-cyan-500 top-10 -left-20" />
        <FloatingOrb className="w-80 h-80 bg-purple-600 bottom-20 right-0" />
        <FloatingOrb className="w-64 h-64 bg-blue-500 top-1/2 left-1/3" />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(6,182,212,1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-lg w-full">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 mb-12 group w-fit" tabIndex={-1}>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5 shadow-xl shadow-cyan-500/30 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-page rounded-[14px] flex items-center justify-center">
                <Play className="w-5 h-5 text-cyan-400 fill-cyan-400/20 ml-0.5" />
              </div>
            </div>
            <div>
              <span className="font-black text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 font-mono">
                AlgoFlow
              </span>
              {/* Item 2: Updated subtitle */}
              <div className="text-[10px] tracking-widest uppercase text-cyan-400/60 light:text-cyan-400 font-mono">
                Interactive DSA Learning Platform
              </div>
            </div>
          </Link>

          <h1 className="text-4xl xl:text-5xl font-black text-ink leading-tight mb-4">
            Master{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
              Data Structures
            </span>
            <br />& Algorithms
          </h1>

          {/* Item 1: Updated tagline */}
          <p className="text-slate-400 text-lg mb-10 leading-relaxed">
            A smarter way to learn Data Structures & Algorithms. Visualize, code, and
            conquer every topic with AI guidance.
          </p>

          {/* Feature list */}
          <div className="space-y-4">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${f.color} p-0.5 flex-shrink-0`}>
                  <div className="w-full h-full bg-slate-900/80 rounded-[10px] flex items-center justify-center">
                    <f.icon className="w-4 h-4 text-ink" />
                  </div>
                </div>
                <span className="text-slate-300 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel: Auth Form ── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-12 relative min-w-0">
        {/* signed-out users get the same theme control as the header */}
        <div className="absolute top-4 right-4 z-20">
          <ThemeSelect id="auth-theme-select" />
        </div>
        {/* Mobile background orbs */}
        <FloatingOrb className="lg:hidden w-72 h-72 bg-cyan-500 -top-20 -right-10" />
        <FloatingOrb className="lg:hidden w-60 h-60 bg-purple-600 bottom-0 -left-10" />

        <div className="relative z-10 w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 justify-center mb-6" aria-hidden="true">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5">
              <div className="w-full h-full bg-page rounded-[10px] flex items-center justify-center">
                <Play className="w-4 h-4 text-cyan-400 fill-cyan-400/20 ml-0.5" />
              </div>
            </div>
            <div>
              <span className="font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 font-mono">
                AlgoFlow
              </span>
              {/* Item 2: updated on mobile too */}
              <div className="text-[9px] tracking-widest uppercase text-cyan-400/60 light:text-cyan-400 font-mono">
                Interactive DSA Learning Platform
              </div>
            </div>
          </div>

          {/* Glassmorphism card */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/40">

            {/* Card header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                  {mode === 'login' ? 'Welcome back' : 'Get started free'}
                </span>
              </div>
              <h2 className="text-2xl font-black text-ink">
                {mode === 'login' ? 'Sign in to AlgoFlow' : 'Create your account'}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>

            {/* Error Banner — item 6 */}
            {error && (
              <div
                id={errorId}
                role="alert"
                className="mb-5 flex items-start gap-2.5 bg-red-500/10 border border-red-500/40 text-red-400 rounded-xl px-4 py-3 text-sm"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate aria-label={mode === 'login' ? 'Sign in form' : 'Create account form'} className="space-y-4">

              {/* Full Name — register only — item 11 */}
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor={nameId}
                    className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden="true" />
                    <input
                      id={nameId}
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Chen"
                      autoComplete="name"
                      aria-required="true"
                      aria-invalid={!!fieldErrors.name}
                      aria-describedby={fieldErrors.name ? `${nameId}-err` : undefined}
                      className={`w-full bg-slate-800/60 border ${
                        fieldErrors.name ? 'border-red-500/60' : 'border-slate-700/60'
                      } rounded-xl pl-10 pr-4 py-3 text-sm text-ink placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/30 transition-all`}
                    />
                  </div>
                  {fieldErrors.name && (
                    <p id={`${nameId}-err`} role="alert" className="mt-1 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" aria-hidden="true" />{fieldErrors.name}
                    </p>
                  )}
                </div>
              )}

              {/* Email — item 11 */}
              <div>
                <label
                  htmlFor={emailId}
                  className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden="true" />
                  <input
                    id={emailId}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-required="true"
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? `${emailId}-err` : undefined}
                    className={`w-full bg-slate-800/60 border ${
                      fieldErrors.email ? 'border-red-500/60' : 'border-slate-700/60'
                    } rounded-xl pl-10 pr-4 py-3 text-sm text-ink placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/30 transition-all`}
                  />
                </div>
                {fieldErrors.email && (
                  <p id={`${emailId}-err`} role="alert" className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" />{fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password — items 8, 11 */}
              <div>
                <label
                  htmlFor={passwordId}
                  className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden="true" />
                  <input
                    id={passwordId}
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Create a strong password' : '••••••••'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    aria-required="true"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={
                      [
                        fieldErrors.password ? `${passwordId}-err` : null,
                        mode === 'register' ? pwHintId : null,
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    className={`w-full bg-slate-800/60 border ${
                      fieldErrors.password ? 'border-red-500/60' : 'border-slate-700/60'
                    } rounded-xl pl-10 pr-12 py-3 text-sm text-ink placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/30 transition-all`}
                  />
                  {/* Show / hide toggle — item 11: aria-label */}
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    aria-controls={passwordId}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded p-0.5"
                  >
                    {showPass
                      ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                      : <Eye    className="w-4 h-4" aria-hidden="true" />
                    }
                  </button>
                </div>

                {fieldErrors.password && (
                  <p id={`${passwordId}-err`} role="alert" className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" />{fieldErrors.password}
                  </p>
                )}

                {/* Item 8: Password requirements checklist (register only) */}
                {mode === 'register' && (
                  <div id={pwHintId} className="mt-3 space-y-1.5" aria-label="Password requirements">
                    {PW_RULES.map((rule, i) => {
                      const ok = pwSatisfied[i];
                      return (
                        <div
                          key={rule.label}
                          className={`flex items-center gap-2 text-xs transition-colors ${
                            ok ? 'text-green-400' : 'text-slate-500'
                          }`}
                        >
                          {ok
                            ? <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                            : <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0" aria-hidden="true" />
                          }
                          <span>{rule.label}</span>
                          {ok && <span className="sr-only">✓ Satisfied</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Forgot Password — item 7: link present but clearly pending */}
              {mode === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      // Password reset is not yet implemented.
                      // When ready: navigate('/forgot-password')
                      alert('Password reset is not yet available. Please contact support@algoflow.io if you need help accessing your account.');
                    }}
                    className="text-xs text-slate-400 hover:text-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit — items 4, 5: isLoading disables + prevents duplicate submissions */}
              <button
                id="auth-submit-btn"
                type="submit"
                disabled={isLoading || (mode === 'register' && !allPwSatisfied && password.length > 0)}
                aria-busy={isLoading}
                className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </button>

              {/* Item 3: Demo credentials — development only, never in production */}
              {IS_DEV && mode === 'login' && (
                <div className="pt-1 text-center">
                  <p className="text-xs text-slate-500">
                    Development only:{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('demo@algoflow.io');
                        setPassword('Demo1234!');
                      }}
                      className="text-cyan-500/70 hover:text-cyan-400 transition-colors underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 rounded"
                    >
                      Use demo credentials
                    </button>
                  </p>
                </div>
              )}
            </form>

            {/* Terms (register mode) */}
            {mode === 'register' && (
              <p className="mt-5 text-center text-xs text-slate-500 leading-relaxed">
                By creating an account, you agree to AlgoFlow's{' '}
                <span className="text-cyan-500/70 cursor-pointer hover:text-cyan-400 transition-colors">Terms of Service</span>{' '}
                and{' '}
                <span className="text-cyan-500/70 cursor-pointer hover:text-cyan-400 transition-colors">Privacy Policy</span>.
              </p>
            )}
          </div>

          {/* Item 9: Subtle footer links */}
          <div className="mt-6 flex items-center justify-center gap-4" role="contentinfo">
            <span className="text-[11px] text-slate-600">© 2025 AlgoFlow</span>
            <span className="text-slate-700">·</span>
            <button
              type="button"
              className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500 rounded"
            >
              Terms
            </button>
            <span className="text-slate-700">·</span>
            <button
              type="button"
              className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500 rounded"
            >
              Privacy
            </button>
            {IS_DEV && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-[11px] text-amber-600/70 font-mono flex items-center gap-1">
                  <Info className="w-3 h-3" aria-hidden="true" />DEV
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
