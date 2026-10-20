import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { VisualizerPage } from './pages/VisualizerPage';
import { PracticePage } from './pages/PracticePage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { LearningPathsPage } from './pages/LearningPathsPage';
import { PatternsPage } from './pages/PatternsPage';
import { NotesPage } from './pages/NotesPage';
import { ProgressPage } from './pages/ProgressPage';
import { AdminPage } from './pages/AdminPage';
import { useAuthStore } from './store/useAuthStore';

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute>
    <div className="min-h-screen bg-page text-slate-200 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header />
      <main className="flex-1">{children}</main>
    </div>
  </ProtectedRoute>
);

export const App: React.FC = () => {
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser);

  // Bootstrap: resolve current session from HttpOnly cookie on first load
  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public Routes ──────────────────────────────────── */}
        <Route path="/auth" element={<AuthPage />} />

        {/* ── Protected Routes ───────────────────────────────── */}
        <Route
          path="/dashboard"
          element={<ProtectedLayout><Dashboard /></ProtectedLayout>}
        />
        <Route
          path="/visualizer"
          element={<ProtectedLayout><VisualizerPage /></ProtectedLayout>}
        />
        <Route
          path="/practice"
          element={<ProtectedLayout><PracticePage /></ProtectedLayout>}
        />
        <Route
          path="/playground"
          element={<ProtectedLayout><PlaygroundPage /></ProtectedLayout>}
        />
        <Route
          path="/learning"
          element={<ProtectedLayout><LearningPathsPage /></ProtectedLayout>}
        />
        <Route
          path="/patterns"
          element={<ProtectedLayout><PatternsPage /></ProtectedLayout>}
        />
        <Route
          path="/notes"
          element={<ProtectedLayout><NotesPage /></ProtectedLayout>}
        />
        <Route
          path="/progress"
          element={<ProtectedLayout><ProgressPage /></ProtectedLayout>}
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <div className="min-h-screen bg-page text-slate-200 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
                <Header />
                <main className="flex-1"><AdminPage /></main>
              </div>
            </ProtectedRoute>
          }
        />

        {/* ── Fallback ────────────────────────────────────────── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
