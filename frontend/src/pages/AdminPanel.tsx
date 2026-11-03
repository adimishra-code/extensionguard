import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, authApi } from '../lib/api';
import {
  Shield,
  Users,
  Server,
  Trash2,
  UserCheck,
  UserX,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Cpu,
  HardDrive
} from 'lucide-react';
import { cn } from '../lib/utils';

export function AdminPanel() {
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Check current user profile
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ['auth-profile'],
    queryFn: () => authApi.profile().then((r) => r.data.user),
  });

  const isAdmin = profileData?.role === 'admin';

  // Admin stats
  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then((r) => r.data),
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Admin users list
  const { data: usersData, isLoading: isUsersLoading } = useQuery({
    queryKey: ['admin-users', userSearch],
    queryFn: () => adminApi.getUsers({ search: userSearch || undefined, limit: 50 }).then((r) => r.data),
    enabled: isAdmin,
  });

  // System telemetry
  const { data: systemData } = useQuery({
    queryKey: ['admin-system'],
    queryFn: () => adminApi.getSystem().then((r) => r.data),
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  // Role mutation
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'user' | 'admin' }) =>
      adminApi.updateRole(userId, role),
    onSuccess: (res) => {
      setActionMessage(res.data.message);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.error || 'Failed to update user role');
      setActionMessage(null);
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: (res) => {
      setActionMessage(res.data.message);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.error || 'Failed to delete user');
      setActionMessage(null);
    },
  });

  // Clean uploads mutation
  const cleanUploadsMutation = useMutation({
    mutationFn: () => adminApi.cleanUploads(),
    onSuccess: (res) => {
      setActionMessage(res.data.message);
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.error || 'Failed to purge uploads');
      setActionMessage(null);
    },
  });

  if (isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 uppercase tracking-wider">
              Super Admin
            </span>
            <span className="text-xs text-gray-400">Strict RBAC Enforced</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Administrator Control Panel</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Manage registered users, monitor system telemetry, and inspect security pipeline health
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => cleanUploadsMutation.mutate()}
            disabled={cleanUploadsMutation.isPending}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <HardDrive className="h-3.5 w-3.5" />
            {cleanUploadsMutation.isPending ? 'Purging...' : 'Purge Temp Uploads'}
          </button>
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
              queryClient.invalidateQueries({ queryKey: ['admin-users'] });
              queryClient.invalidateQueries({ queryKey: ['admin-system'] });
            }}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-green-600 hover:text-green-800 font-bold">&times;</button>
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-600 hover:text-red-800 font-bold">&times;</button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {isStatsLoading ? '...' : statsData?.users.total || 0}
              </p>
              <p className="text-xs text-green-600 mt-1 font-medium">
                {statsData?.users.verified || 0} verified accounts
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Scans Executed</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {isStatsLoading ? '...' : statsData?.scans.total || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Across {statsData?.scans.extensions || 0} unique extensions
              </p>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <Shield className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">High Risk Threats</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {isStatsLoading ? '...' : (statsData?.security.critical_findings || 0) + (statsData?.security.high_findings || 0)}
              </p>
              <p className="text-xs text-red-500 mt-1 font-medium">
                {statsData?.security.critical_findings || 0} critical vulnerabilities
              </p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active Monitoring</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {isStatsLoading ? '...' : statsData?.security.active_monitoring_sessions || 0}
              </p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">
                Real-time WebSocket sessions
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <Server className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">User Management & Access Control</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage user roles, verify account status, and control system permissions</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by email..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3">Last Active</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isUsersLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    Loading users...
                  </td>
                </tr>
              ) : !usersData?.users || usersData.users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No users found matching search criteria.
                  </td>
                </tr>
              ) : (
                usersData.users.map((u) => {
                  const isSelf = u.id === profileData?.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{u.email}</span>
                          {isSelf && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 font-mono">ID: {u.id.slice(0, 12)}...</span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-semibold',
                            u.role === 'admin'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          )}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {u.is_verified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                            <Clock className="h-3.5 w-3.5" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {u.role === 'admin' ? (
                          <button
                            onClick={() => roleMutation.mutate({ userId: u.id, role: 'user' })}
                            disabled={isSelf || roleMutation.isPending}
                            title={isSelf ? 'Cannot demote self' : 'Demote to user'}
                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => roleMutation.mutate({ userId: u.id, role: 'admin' })}
                            disabled={roleMutation.isPending}
                            title="Promote to admin"
                            className="p-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 text-blue-600"
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to permanently delete user ${u.email}?`)) {
                              deleteMutation.mutate(u.id);
                            }
                          }}
                          disabled={isSelf || deleteMutation.isPending}
                          title={isSelf ? 'Cannot delete self' : 'Delete user'}
                          className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Telemetry Card */}
      {systemData && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary-600" />
              <h2 className="text-base font-bold text-gray-900">Runtime Telemetry & Infrastructure</h2>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-800 font-mono">
              Uptime: {Math.floor(systemData.uptime_seconds / 3600)}h {Math.floor((systemData.uptime_seconds % 3600) / 60)}m
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 font-medium">Node.js Engine</p>
              <p className="font-mono text-gray-900 mt-0.5">{systemData.node_version} ({systemData.arch})</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 font-medium">Memory Footprint</p>
              <p className="font-mono text-gray-900 mt-0.5">{systemData.memory.heap_used_mb} MB / {systemData.memory.heap_total_mb} MB Heap</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 font-medium">AI Security Engine</p>
              <p className="font-mono text-gray-900 mt-0.5">{systemData.llm.provider.toUpperCase()} ({systemData.llm.model})</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 font-medium">Environment</p>
              <p className="font-mono text-gray-900 mt-0.5">{systemData.environment.toUpperCase()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

