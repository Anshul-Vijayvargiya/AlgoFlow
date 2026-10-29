import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Optional: require a specific role to access this route */
  requiredRole?: 'USER' | 'ADMIN' | 'SUPER_ADMIN' | 'user' | 'admin';
}

/**
 * Wraps any route that requires authentication.
 * - If auth state is still initializing → show a full-screen spinner
 * - If unauthenticated → redirect to /auth?mode=login, preserving the original path
 * - If role does not match → redirect to /dashboard with a 403 message (future: dedicated page)
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, isInitialized } = useAuthStore();
  const location = useLocation();

  // Still bootstrapping from server session (first load)
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5 shadow-xl shadow-cyan-500/30 animate-pulse">
            <div className="w-full h-full bg-surface rounded-[14px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
            </div>
          </div>
          <p className="text-slate-400 text-sm font-mono tracking-wider animate-pulse">Loading AlgoFlow…</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Role check (admin-only routes)
  if (requiredRole) {
    const req = requiredRole.toUpperCase();
    const current = user.role?.toUpperCase();
    const hasAdminAccess = current === 'ADMIN' || current === 'SUPER_ADMIN';

    if ((req === 'ADMIN' || req === 'SUPER_ADMIN') && !hasAdminAccess) {
      return <Navigate to="/dashboard" replace />;
    }
  }


  return <>{children}</>;
};
