import axios from 'axios';
import type {
  Scan,
  Extension,
  Finding,
  ScanType,
  ThreatIntelligenceItem,
  CommunityReportItem,
  DifferentialAnalysisItem,
  AlertItem,
  NetworkLogItem,
} from '@extension-guard/shared';


const TOKEN_KEY = 'eg_auth_token';

const apiBase = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, '')}/api`
  : '/api';

export const api = axios.create({
  baseURL: apiBase,
  // 15 minutes — sandbox scans can take up to 10 minutes
  timeout: 900000,
});

// Attach JWT token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — clear stale token
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

/** Store a JWT token returned from login/register */
export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Clear stored JWT token (logout) */
export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Check if user has a stored token */
export function hasAuthToken(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

export const scansApi = {
  list: (params?: { limit?: number; offset?: number; status?: string; type?: string }) =>
    api.get<{ scans: Scan[]; total: number }>('/scans', { params }),

  get: (id: string) =>
    api.get<Scan>(`/scans/${id}`),

  create: (file: File, scanType: ScanType = 'quick') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scanType', scanType);
    return api.post<{ scan_id: string; extension_id: string; status: string; message: string }>(
      '/scans',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },

  createFromCws: (extensionId: string, scanType: ScanType = 'quick') =>
    api.post<{ scan_id: string; extension_id: string; status: string; message: string }>(
      '/scans/cws',
      { extensionId, scanType }
    ),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/scans/${id}`),

  getFindings: (id: string, params?: { severity?: string; category?: string; limit?: number; offset?: number }) =>
    api.get<{ findings: Finding[]; total: number }>(`/scans/${id}/findings`, { params }),

  getReport: (id: string) =>
    api.get(`/scans/${id}/report`),
};

export const extensionsApi = {
  list: (params?: { limit?: number; offset?: number; search?: string }) =>
    api.get<{ extensions: Extension[]; total: number }>('/extensions', { params }),

  get: (id: string) =>
    api.get<Extension>(`/extensions/${id}`),
};

export const healthApi = {
  check: () =>
    api.get('/health'),

  detailed: () =>
    api.get('/health/detailed'),
};

export const authApi = {
  register: (email: string, password: string) =>
    api.post<{ token: string; user: { id: string; email: string; role: string; is_verified: boolean; api_key: string }; message?: string }>(
      '/auth/register',
      { email, password }
    ),

  login: (email: string, password: string) =>
    api.post<{ token: string; user: { id: string; email: string; role: string; is_verified: boolean; api_key: string }; message?: string }>(
      '/auth/login',
      { email, password }
    ),

  verifyEmail: (data: { email?: string; code?: string; token?: string }) =>
    api.post<{ success: boolean; message: string; user?: any }>(
      '/auth/verify-email',
      data
    ),

  resendVerification: (email: string) =>
    api.post<{ message: string }>(
      '/auth/resend-verification',
      { email }
    ),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>(
      '/auth/forgot-password',
      { email }
    ),

  resetPassword: (data: { token: string; password: string }) =>
    api.post<{ message: string }>(
      '/auth/reset-password',
      data
    ),

  profile: () =>
    api.get<{ user: { id: string; email: string; role: string; is_verified: boolean; api_key: string; created_at: string; last_login_at: string | null } }>('/auth/profile'),

  regenerateApiKey: () =>
    api.post('/auth/regenerate-api-key'),
};

export const adminApi = {
  getStats: () =>
    api.get<{
      users: { total: number; verified: number; unverified: number };
      scans: { total: number; extensions: number };
      security: { critical_findings: number; high_findings: number; active_monitoring_sessions: number };
    }>('/admin/stats'),

  getUsers: (params?: { limit?: number; offset?: number; search?: string }) =>
    api.get<{
      users: Array<{
        id: string;
        email: string;
        role: string;
        is_verified: boolean;
        created_at: string;
        last_login_at: string | null;
        _count: { sessions: number; alerts: number; community_reports: number };
      }>;
      total: number;
      limit: number;
      offset: number;
    }>('/admin/users', { params }),

  updateRole: (userId: string, role: 'user' | 'admin') =>
    api.post<{ message: string; user: any }>(`/admin/users/${userId}/role`, { role }),

  deleteUser: (userId: string) =>
    api.delete<{ success: boolean; message: string }>(`/admin/users/${userId}`),

  getSystem: () =>
    api.get<{
      node_version: string;
      platform: string;
      arch: string;
      uptime_seconds: number;
      environment: string;
      analyzer_version: string;
      ruleset_version: string;
      memory: { heap_used_mb: number; heap_total_mb: number; rss_mb: number };
      llm: { provider: string; model: string };
    }>('/admin/system'),

  cleanUploads: () =>
    api.post<{ message: string; deletedFiles: number; reclaimedMb?: string }>('/admin/maintenance/clean-uploads'),
};

export const threatIntelApi = {
  checkExtension: (extensionId: string) =>
    api.post<{ extensionId: string; isThreat: boolean; severity?: string; threats: ThreatIntelligenceItem[] }>(
      '/threats/check/extension',
      { extensionId }
    ),

  checkDomain: (domain: string) =>
    api.post<{ domain: string; isThreat: boolean; severity?: string; threats: ThreatIntelligenceItem[] }>(
      '/threats/check/domain',
      { domain }
    ),

  listThreats: (params?: { type?: string; severity?: string; limit?: number }) =>
    api.get<{ threats: ThreatIntelligenceItem[]; count: number } | ThreatIntelligenceItem[]>('/threats', { params })
      .then((res) => {
        const raw = res.data;
        const threats = Array.isArray(raw) ? raw : (raw as any)?.threats || [];
        return { ...res, data: threats as ThreatIntelligenceItem[] };
      }),

  verifyThreat: (id: string) =>
    api.post(`/threats/${id}/verify`),

  submitReport: (data: {
    extensionId: string;
    extensionName: string;
    extensionVersion?: string;
    reportType: string;
    description: string;
    evidence?: unknown;
  }) => api.post('/threats/reports', data),

  listReports: (params?: { status?: string; limit?: number; offset?: number }) =>
    api.get<{ reports: CommunityReportItem[]; total: number }>('/threats/reports', { params }),

  getStats: () =>
    api.get<{
      stats?: any;
      totalThreats: number;
      totalReports: number;
      verifiedThreats: number;
      bySeverity: Record<string, number>;
      byType: Record<string, number>;
    }>('/threats/stats').then((res) => {
      const stats = res.data?.stats || res.data;
      return { ...res, data: stats };
    }),
};

export const alertsApi = {
  list: (params?: { unreadOnly?: boolean; limit?: number; offset?: number }) =>
    api.get<{ alerts: AlertItem[]; count: number } | AlertItem[]>('/alerts', { params })
      .then((res) => {
        const raw = res.data;
        const alerts = Array.isArray(raw) ? raw : (raw as any)?.alerts || [];
        return { ...res, data: alerts as AlertItem[] };
      }),

  markAsRead: (id: string) =>
    api.post<{ success: boolean }>(`/alerts/${id}/read`),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/alerts/${id}`),

  getUnreadCount: () =>
    api.get<{ count: number }>('/alerts/unread-count'),
};

export const differentialApi = {
  getLatest: (params?: { limit?: number; severity?: string }) =>
    api.get<{ analyses: DifferentialAnalysisItem[]; count: number }>('/differential/latest', { params }),

  getHighRisk: (params?: { limit?: number }) =>
    api.get<{ analyses: DifferentialAnalysisItem[]; count: number }>('/differential/high-risk', { params }),

  getHistory: (extensionId: string, params?: { limit?: number }) =>
    api.get<{ extensionId: string; history: DifferentialAnalysisItem[]; count: number }>(
      `/differential/history/${extensionId}`,
      { params }
    ),

  getById: (analysisId: string) =>
    api.get<{ analysis: DifferentialAnalysisItem }>(`/differential/${analysisId}`),

  compareLatest: (extensionId: string) =>
    api.post<{ message: string; analysis: DifferentialAnalysisItem }>(
      `/differential/compare-latest/${extensionId}`
    ),
};


export const networkApi = {
  getLogs: (params?: { extensionId?: string; blocked?: boolean; limit?: number; offset?: number }) =>
    api.get<{ logs: NetworkLogItem[]; total: number }>('/network/logs', { params }),

  getStats: (extensionId?: string) =>
    api.get<{
      totalRequests: number;
      blockedRequests: number;
      suspiciousCount: number;
      topDomains: Array<{ domain: string; count: number }>;
    }>('/network/stats', { params: { extensionId } }),

  getSuspicious: (extensionId?: string) =>
    api.get<NetworkLogItem[]>('/network/suspicious', { params: { extensionId } }),
};

export default api;