import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  Code2, 
  BarChart3, 
  FileText, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Loader2,
  RefreshCw,
  X
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { apiClient } from '../api';
import type { AdminMetrics, AdminUserItem, AdminAuditItem } from '../api';

export const AdminPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'metrics' | 'users' | 'problems' | 'audit'>('metrics');

  // Metrics State
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  // Users State
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('All');
  const [userStatusFilter, setUserStatusFilter] = useState('All');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AdminAuditItem[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Notification / Error banners
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Load metrics
  const loadMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const data = await apiClient.admin.getMetrics();
      setMetrics(data);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err?.message || 'Failed to load metrics.' });
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  // Load users
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await apiClient.admin.getUsers({
        search: userSearch || undefined,
        role: userRoleFilter !== 'All' ? userRoleFilter : undefined,
        status: userStatusFilter !== 'All' ? userStatusFilter : undefined,
      });
      setUsers(data.users);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err?.message || 'Failed to load users.' });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Load audit logs
  const loadAuditLogs = async () => {
    setIsLoadingAudit(true);
    try {
      const data = await apiClient.admin.getAuditLogs();
      setAuditLogs(data.logs);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err?.message || 'Failed to load audit logs.' });
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'metrics') loadMetrics();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'audit') loadAuditLogs();
  }, [activeTab]);

  // Handle user account status change (Activate / Suspend)
  const handleToggleStatus = async (targetUser: AdminUserItem) => {
    const newStatus = targetUser.accountStatus === 'active' ? 'suspended' : 'active';
    const actionWord = newStatus === 'active' ? 'activate' : 'suspend';

    if (!window.confirm(`Are you sure you want to ${actionWord} ${targetUser.email}?`)) {
      return;
    }

    try {
      await apiClient.admin.updateUserStatus(targetUser.id, newStatus);
      setBannerMessage({ type: 'success', text: `User ${targetUser.email} has been ${newStatus}.` });
      loadUsers();
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err?.message || `Failed to ${actionWord} user.` });
    }
  };

  // Handle role change (SUPER_ADMIN only)
  const handleRoleChange = async (targetUser: AdminUserItem, newRole: any) => {
    if (!window.confirm(`Are you sure you want to set role to ${newRole} for ${targetUser.email}?`)) {
      return;
    }

    try {
      await apiClient.admin.updateUserRole(targetUser.id, newRole);
      setBannerMessage({ type: 'success', text: `Updated role for ${targetUser.email} to ${newRole}.` });
      loadUsers();
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err?.message || 'Failed to update user role.' });
    }
  };

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-200 p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="border-b border-slate-800 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono mb-2">
            <Shield className="w-3.5 h-3.5" />
            ADMINISTRATIVE CONSOLE
          </div>
          <h1 className="text-3xl font-extrabold font-mono text-white flex items-center gap-3">
            AlgoFlow System Management
            <span className="text-xs px-2.5 py-1 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 font-normal">
              {user?.role}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Server-side governed administration, multi-user moderation, and audit compliance.
          </p>
        </div>

        <button
          onClick={() => {
            if (activeTab === 'metrics') loadMetrics();
            if (activeTab === 'users') loadUsers();
            if (activeTab === 'audit') loadAuditLogs();
          }}
          className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-cyan-300 rounded-xl text-xs font-mono flex items-center gap-2 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {bannerMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-mono flex items-center justify-between ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            onClick={() => setBannerMessage(null)}
            className="p-1 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          id="admin-tab-metrics"
          onClick={() => setActiveTab('metrics')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'metrics'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Platform Metrics
        </button>
        <button
          id="admin-tab-users"
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          User Management
        </button>
        <button
          id="admin-tab-audit"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          Audit Trail
        </button>
      </div>

      {/* ── METRICS TAB ────────────────────────────────────────── */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          {isLoadingMetrics && !metrics ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="text-xs font-mono text-slate-400">Loading platform metrics...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>Registered Users</span>
                  <Users className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-3xl font-bold font-mono text-white">
                  {metrics?.totalUsers ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Active in past 7d: {metrics?.activeUsersPastWeek ?? 0}
                </div>
              </div>

              <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>Published Problems</span>
                  <Code2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-bold font-mono text-emerald-400">
                  {metrics?.totalProblems ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">Curated catalog</div>
              </div>

              <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>Practice Submissions</span>
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-3xl font-bold font-mono text-purple-300">
                  {metrics?.totalSubmissions ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">Persisted user attempts</div>
              </div>

              <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl p-5 shadow-lg space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                  <span>Server Uptime</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-3xl font-bold font-mono text-amber-400">
                  {Math.floor((metrics?.serverUptimeSeconds || 0) / 60)}m
                </div>
                <div className="text-[11px] text-slate-500 font-mono">Node.js process active</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── USER MANAGEMENT TAB ─────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0B0F19] p-4 rounded-2xl border border-cyan-500/15">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                id="admin-user-search-input"
                type="text"
                placeholder="Search user name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={userRoleFilter}
                onChange={(e) => {
                  setUserRoleFilter(e.target.value);
                  setTimeout(loadUsers, 50);
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="All">All Roles</option>
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>

              <select
                value={userStatusFilter}
                onChange={(e) => {
                  setUserStatusFilter(e.target.value);
                  setTimeout(loadUsers, 50);
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {isLoadingUsers ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="text-xs font-mono text-slate-400">Loading user directory...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-3xl p-12 text-center text-xs font-mono text-slate-500">
              No users found matching current filters.
            </div>
          ) : (
            <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-4">User</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Streak / Solved</th>
                      <th className="p-4">Joined Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users.map((u) => {
                      const isSelf = u.id === user?.id;
                      const canModifyStatus = !isSelf && (isSuperAdmin || u.role === 'USER');
                      const canModifyRole = isSuperAdmin && !isSelf;

                      return (
                        <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="p-4">
                            <div className="font-bold text-white">{u.name}</div>
                            <div className="text-[11px] text-slate-400">{u.email}</div>
                          </td>
                          <td className="p-4">
                            {canModifyRole ? (
                              <select
                                value={u.role}
                                onChange={(e) => handleRoleChange(u, e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-cyan-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                              >
                                <option value="USER">USER</option>
                                <option value="ADMIN">ADMIN</option>
                                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                              </select>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  u.role === 'SUPER_ADMIN'
                                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                    : u.role === 'ADMIN'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                {u.role}
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                u.accountStatus === 'active'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {u.accountStatus}
                            </span>
                          </td>
                          <td className="p-4 text-slate-400">
                            {u.streakDays}d streak • {u.solvedCount} solved
                          </td>
                          <td className="p-4 text-slate-500">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-right">
                            {canModifyStatus ? (
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                  u.accountStatus === 'active'
                                    ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                                    : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                                }`}
                              >
                                {u.accountStatus === 'active' ? 'Suspend' : 'Activate'}
                              </button>
                            ) : (
                              <span className="text-slate-600 text-[11px] italic">
                                {isSelf ? 'Self' : 'Protected'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AUDIT LOGS TAB ──────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {isLoadingAudit ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="text-xs font-mono text-slate-400">Loading audit trail...</span>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-3xl p-12 text-center text-xs font-mono text-slate-500">
              No administrative audit events recorded yet.
            </div>
          ) : (
            <div className="bg-[#0B0F19] border border-cyan-500/15 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Admin</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Target Type</th>
                      <th className="p-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-4 text-slate-500 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-cyan-300 font-bold">{log.adminName}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{log.targetType}</td>
                        <td className="p-4 text-slate-300 max-w-md truncate">
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPage;
