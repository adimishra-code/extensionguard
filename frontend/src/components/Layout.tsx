import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Shield, Search, List, Settings, Menu, X, Package, Activity,
  ShieldAlert, GitCompare, Bell, Check, User, LogIn, LogOut, Key,
  Lock, Mail, CheckCircle2, AlertCircle
} from 'lucide-react';
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
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify' | 'forgot'>('login');
  const [emailInput, setEmailInput] = useState('security@extensionguard.io');
  const [passwordInput, setPasswordInput] = useState('admin12345');
  const [otpInput, setOtpInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);
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
      if (authMode === 'register') {
        setAuthMode('verify');
        setAuthSuccessMessage(data.message || 'Verification code sent to your email.');
      } else {
        setAuthModalOpen(false);
      }
      queryClient.invalidateQueries();
    },
    onError: (err: any) => {
      setAuthError(err.response?.data?.error || 'Authentication failed. Please verify credentials.');
      setAuthSuccessMessage(null);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (code: string) => authApi.verifyEmail({ email: emailInput, code }).then(r => r.data),
    onSuccess: (data) => {
      setAuthSuccessMessage(data.message);
      setAuthError(null);
      queryClient.invalidateQueries({ queryKey: ['auth-profile'] });
      setTimeout(() => {
        setAuthModalOpen(false);
        setAuthSuccessMessage(null);
      }, 1500);
    },
    onError: (err: any) => {
      setAuthError(err.response?.data?.error || 'Verification failed. Please check the code.');
      setAuthSuccessMessage(null);
    },
  });

  const resendMutation = useMutation({
    mutationFn: (email: string) => authApi.resendVerification(email).then(r => r.data),
    onSuccess: (data) => {
      setAuthSuccessMessage(data.message);
      setAuthError(null);
    },
    onError: (err: any) => {
      setAuthError(err.response?.data?.error || 'Failed to resend code');
    },
  });

  const forgotMutation = useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email).then(r => r.data),
    onSuccess: (data) => {
      setAuthSuccessMessage(data.message);
      setAuthError(null);
    },
    onError: (err: any) => {
      setAuthError(err.response?.data?.error || 'Failed to send reset link');
    },
  });

  const handleLogout = () => {
    clearAuthToken();
    queryClient.invalidateQueries();
  };

  const alerts = alertsData || [];
  const unreadAlerts = alerts.filter((a) => !a.read);
  const isHealthy = health?.status === 'ok' || health?.status === 'healthy';

  const navItems = [
    ...navigation,
    ...(userProfile?.role === 'admin' ? [{ name: 'Admin Panel', href: '/admin', icon: Lock }] : []),
  ];


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
          {navItems.map((item) => {
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
                    ? 'bg-primary-50 text-primary-700 font-semibold'
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
        <div className="p-4 border-t border-gray-200 space-y-2">
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
          <div className="text-[11px] text-gray-400 flex items-center justify-between">
            <NavLink to="/privacy" className="hover:text-primary-600 transition-colors">
              Privacy Policy
            </NavLink>
            <span>•</span>
            <span className="text-gray-300">CWS Compliant</span>
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
                {navItems.find(n => location.pathname === n.href || (n.href !== '/dashboard' && location.pathname.startsWith(n.href)))?.name || 'ExtensionGuard'}
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
                    {userProfile.role === 'admin' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-semibold">
                        Admin
                      </span>
                    )}
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
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                      setAuthSuccessMessage(null);
                      setAuthModalOpen(true);
                    }}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <LogIn className="h-3.5 w-3.5" /> Sign In
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Unverified Email Alert Banner */}
        {isAuthed && userProfile && !userProfile.is_verified && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 sm:px-6 flex items-center justify-between text-xs text-amber-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span>
                Your email address <strong>{userProfile.email}</strong> is unverified.
              </span>
            </div>
            <button
              onClick={() => {
                setEmailInput(userProfile.email);
                setAuthMode('verify');
                setAuthError(null);
                setAuthSuccessMessage(null);
                setAuthModalOpen(true);
              }}
              className="font-medium text-amber-900 underline hover:text-amber-700 ml-4 flex-shrink-0"
            >
              Verify with Code →
            </button>
          </div>
        )}

        {/* Authentication Modal */}
        {authModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 relative">
              <button
                onClick={() => {
                  setAuthModalOpen(false);
                  setAuthError(null);
                  setAuthSuccessMessage(null);
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Mode Header */}
              <div className="text-center space-y-1">
                <div className="h-12 w-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-2">
                  {authMode === 'verify' ? (
                    <Mail className="h-6 w-6" />
                  ) : authMode === 'forgot' ? (
                    <Lock className="h-6 w-6" />
                  ) : (
                    <Key className="h-6 w-6" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900">
                  {authMode === 'login' && 'Sign In to ExtensionGuard'}
                  {authMode === 'register' && 'Create an Account'}
                  {authMode === 'verify' && 'Verify Your Email'}
                  {authMode === 'forgot' && 'Reset Password'}
                </h3>
                <p className="text-xs text-gray-500">
                  {authMode === 'login' && 'Access live threat intelligence, differential analysis & alert triage'}
                  {authMode === 'register' && 'Enter your email to receive an email verification code'}
                  {authMode === 'verify' && `Enter the 6-digit verification code sent to ${emailInput}`}
                  {authMode === 'forgot' && 'We will send you a password reset token and instructions'}
                </p>
              </div>

              {/* Feedback Banners */}
              {authSuccessMessage && (
                <div className="p-3 rounded-lg bg-green-50 text-green-800 text-xs border border-green-200 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{authSuccessMessage}</span>
                </div>
              )}
              {authError && (
                <div className="p-3 rounded-lg bg-danger-50 text-danger-800 text-xs border border-danger-200 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-danger-600 flex-shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Login & Register Forms */}
              {(authMode === 'login' || authMode === 'register') && (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setAuthError(null);
                      setAuthSuccessMessage(null);
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
                        placeholder="you@company.com"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-700">Password</label>
                        {authMode === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('forgot');
                              setAuthError(null);
                              setAuthSuccessMessage(null);
                            }}
                            className="text-xs text-primary-600 hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="••••••••"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loginMutation.isPending}
                      className="w-full btn-secondary text-sm py-2 font-medium"
                    >
                      {loginMutation.isPending
                        ? 'Processing...'
                        : authMode === 'login'
                        ? 'Sign In'
                        : 'Create Account & Send Verification'}
                    </button>
                  </form>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode(authMode === 'login' ? 'register' : 'login');
                        setAuthError(null);
                        setAuthSuccessMessage(null);
                      }}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      {authMode === 'login'
                        ? "Don't have an account? Register here"
                        : 'Already have an account? Sign In'}
                    </button>
                  </div>
                </>
              )}

              {/* Verify OTP Mode */}
              {authMode === 'verify' && (
                <div className="space-y-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!otpInput.trim()) return;
                      verifyMutation.mutate(otpInput.trim());
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Verification Code / Token</label>
                      <input
                        type="text"
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        placeholder="e.g. 123456"
                        required
                        maxLength={64}
                        className="w-full px-3 py-2 text-center text-lg tracking-widest font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={verifyMutation.isPending}
                      className="w-full btn-primary text-sm py-2 font-medium"
                    >
                      {verifyMutation.isPending ? 'Verifying...' : 'Verify Code'}
                    </button>
                  </form>

                  <div className="flex items-center justify-between text-xs pt-2">
                    <button
                      type="button"
                      onClick={() => resendMutation.mutate(emailInput)}
                      disabled={resendMutation.isPending}
                      className="text-primary-600 hover:underline"
                    >
                      {resendMutation.isPending ? 'Resending...' : 'Resend Code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError(null);
                        setAuthSuccessMessage(null);
                      }}
                      className="text-gray-500 hover:underline"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </div>
              )}

              {/* Forgot Password Mode */}
              {authMode === 'forgot' && (
                <div className="space-y-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!emailInput.trim()) return;
                      forgotMutation.mutate(emailInput.trim());
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
                        placeholder="you@company.com"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={forgotMutation.isPending}
                      className="w-full btn-primary text-sm py-2 font-medium"
                    >
                      {forgotMutation.isPending ? 'Sending...' : 'Send Reset Instructions'}
                    </button>
                  </form>

                  <div className="text-center text-xs pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError(null);
                        setAuthSuccessMessage(null);
                      }}
                      className="text-primary-600 hover:underline"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </div>
              )}
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