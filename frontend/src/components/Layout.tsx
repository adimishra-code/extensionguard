import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Shield, Search, List, Settings, Menu, X, Package, Activity, ShieldAlert, GitCompare, Bell, Check, User, LogIn, LogOut, Key } from 'lucide-react';
import { useState } from 'react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { healthApi, alertsApi, authApi, setAuthToken, clearAuthToken, hasAuthToken } from '../lib/api';
import { cn, formatRelativeTime, getSeverityBadge } from '../lib/utils';
import type { AlertItem } from '@extension-guard/shared';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Shield },
  { name: 'New Scan', href: '/scan', icon: Search },
  { name: 'Scans', href: '/scans', icon: List },
  { name: 'Extensions', href: '/extensions', icon: Package },
  { name: 'Threat Intel', href: '/threats', icon: ShieldAlert },
  { name: 'Version Diff', href: '/differential', icon: GitCompare },
  { name: 'Live Monitor', href: '/live', icon: Activity },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Layout() {
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('security@extensionguard.io');
  const [passwordInput, setPasswordInput] = useState('admin12345');
  const [authError, setAuthError] = useState<string | null>(null);
  const location = useLocation();

  const isAuthed = hasAuthToken();

  const { data: userProfile } = useQuery({
    queryKey: ['auth-profile', isAuthed],
    queryFn: () => authApi.profile().then(r => r.data.user).catch(() => null),
    enabled: isAuthed,
    retry: false,
  });

  const { data: health } = useQuery({
    queryKey: ['health-status'],
    queryFn: () => healthApi.check().then(r => r.data),
    refetchInterval: 15000,
    retry: false,
  });

  const { data: alertsData } = useQuery<AlertItem[]>({
    queryKey: ['alerts', 'header'],
    queryFn: () => alertsApi.list({ limit: 6 }).then((r) => r.data).catch(() => []),
    refetchInterval: 20000,
    retry: false,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => alertsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, pass }: { email: string; pass: string }) => {
      if (authMode === 'login') {
        return (await authApi.login(email, pass)).data;
      } else {
        return (await authApi.register(email, pass)).data;
      }
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      setAuthError(null);
      setAuthModalOpen(false);
      queryClient.invalidateQueries();
    },
    onError: (err: any) => {
      setAuthError(err.response?.data?.error || 'Authentication failed. Please verify credentials.');
    },
  });

  const handleQuickDemoLogin = () => {
    loginMutation.mutate({ email: 'security@extensionguard.io', pass: 'admin12345' });
  };

  const handleLogout = () => {
    clearAuthToken();
    queryClient.invalidateQueries();
  };

  const alerts = alertsData || [];
  const unreadAlerts = alerts.filter((a) => !a.read);
  const isHealthy = health?.status === 'ok';


  return (
    <div className="min-h-screen bg-gray-50">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Sidebar"
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200">
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary-600" />
            <span className="text-xl font-bold text-gray-900">ExtensionGuard</span>
          </NavLink>
          <button
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href ||
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">v1.0.1</p>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'h-2 w-2 rounded-full',
                health === undefined
                  ? 'bg-gray-300'
                  : isHealthy
                    ? 'bg-green-500'
                    : 'bg-red-500'
              )} />
              <span className="text-xs text-gray-400">
                {health === undefined ? 'checking...' : isHealthy ? 'online' : 'degraded'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex-1 lg:flex-none">
              <h1 className="text-lg font-semibold text-gray-900 truncate">
                {navigation.find(n => location.pathname === n.href || location.pathname.startsWith(n.href))?.name || 'ExtensionGuard'}
              </h1>
            </div>
            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAlertsOpen(!alertsOpen)}
                className="relative p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                aria-label="View security alerts"
              >
                <Bell className="h-5 w-5" />
                {unreadAlerts.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger-600 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadAlerts.length}
                  </span>
                )}
              </button>

              {/* Alerts Dropdown Drawer */}
              {alertsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setAlertsOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-12 z-40 w-80 sm:w-96 rounded-xl bg-white shadow-xl ring-1 ring-black/5 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">Security Alerts</span>
                        {unreadAlerts.length > 0 && (
                          <span className="badge bg-danger-50 text-danger-700 text-xs">
                            {unreadAlerts.length} new
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setAlertsOpen(false)}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                      >
                        Close
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 space-y-1">
                      {alerts.length > 0 ? (
                        alerts.map((alert) => (
                          <div
                            key={alert.id}
                            className={cn(
                              'p-2.5 rounded-lg text-xs space-y-1 transition-colors',
                              alert.read ? 'opacity-60 bg-gray-50/50' : 'bg-primary-50/30'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn('badge text-[10px]', getSeverityBadge(alert.severity))}>
                                {alert.severity}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                {formatRelativeTime(alert.created_at)}
                              </span>
                            </div>
                            <h4 className="font-semibold text-gray-900 text-xs mt-1">{alert.title}</h4>
                            <p className="text-gray-600 text-[11px] leading-relaxed">{alert.message}</p>
                            {!alert.read && (
                              <div className="pt-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => markReadMutation.mutate(alert.id)}
                                  className="text-[11px] text-primary-600 hover:text-primary-800 flex items-center gap-1 font-medium"
                                >
                                  <Check className="h-3 w-3" /> Mark read
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="py-6 text-center text-xs text-gray-400">
                          No active security alerts
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              {/* Authentication Status / Profile Button */}
              {isAuthed && userProfile ? (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-xs text-gray-700">
                    <User className="h-3.5 w-3.5 text-primary-600" />
                    <span className="font-medium truncate max-w-[150px]">{userProfile.email}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    title="Sign Out"
                    className="p-2 rounded-lg text-gray-500 hover:text-danger-600 hover:bg-gray-100 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <LogIn className="h-3.5 w-3.5" /> Sign In / Demo
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Authentication Modal */}
        {authModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 relative">
              <button
                onClick={() => setAuthModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="text-center space-y-1">
                <div className="h-12 w-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-2">
                  <Key className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">
                  {authMode === 'login' ? 'Sign In to ExtensionGuard' : 'Create an Account'}
                </h3>
                <p className="text-xs text-gray-500">
                  Access live threat intelligence, differential analysis & alert triage
                </p>
              </div>

              {/* Quick Demo Login Banner */}
              <div className="p-3 bg-primary-50 rounded-xl border border-primary-200 text-center space-y-2">
                <p className="text-xs text-primary-800 font-medium">Testing locally or in evaluation mode?</p>
                <button
                  type="button"
                  onClick={handleQuickDemoLogin}
                  disabled={loginMutation.isPending}
                  className="w-full py-2 px-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-xs transition-colors shadow-sm"
                >
                  {loginMutation.isPending ? 'Authenticating...' : '⚡ Quick Login as Demo Analyst'}
                </button>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-3 text-xs text-gray-400 uppercase">Or with credentials</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              {authError && (
                <div className="p-2.5 rounded-lg bg-danger-50 text-danger-800 text-xs border border-danger-200">
                  {authError}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loginMutation.mutate({ email: emailInput, pass: passwordInput });
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full btn-secondary text-sm py-2 font-medium"
                >
                  {loginMutation.isPending ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Register'}
                </button>
              </form>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'register' : 'login');
                    setAuthError(null);
                  }}
                  className="text-xs text-primary-600 hover:underline"
                >
                  {authMode === 'login' ? "Don't have an account? Register here" : 'Already have an account? Sign In'}
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}