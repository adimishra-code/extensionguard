import axios from 'axios';
import type {
  Scan,
  Extension,
  Finding,
  ScanType,
  ThreatIntelligenceItem,
  CommunityReportItem,
  DifferentialAnalysisItem,
  SupplyChainEventItem,
  AlertItem,
  NetworkLogItem,
} from '@extension-guard/shared';

const TOKEN_KEY = 'eg_auth_token';

export const api = axios.create({
  baseURL: '/api',
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
    api.post<{ token: string; user: { id: string; email: string; api_key: string } }>(
      '/auth/register',
      { email, password }
    ),

  login: (email: string, password: string) =>
    api.post<{ token: string; user: { id: string; email: string; api_key: string } }>(
      '/auth/login',
      { email, password }
    ),

  profile: () =>
    api.get('/auth/profile'),

  regenerateApiKey: () =>
    api.post('/auth/regenerate-api-key'),
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
    api.get<ThreatIntelligenceItem[]>('/threats', { params }),

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
      totalThreats: number;
      totalReports: number;
      verifiedThreats: number;
      bySeverity: Record<string, number>;
      byType: Record<string, number>;
    }>('/threats/stats'),
};

export const alertsApi = {
  list: (params?: { unreadOnly?: boolean; limit?: number; offset?: number }) =>
    api.get<AlertItem[]>('/alerts', { params }),

  markAsRead: (id: string) =>
    api.patch<AlertItem>(`/alerts/${id}/read`),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/alerts/${id}`),

  getUnreadCount: () =>
    api.get<{ count: number }>('/alerts/unread-count'),
};

export const differentialApi = {
  compare: (extensionId: string, oldVersion: string, newVersion: string) =>
    api.post<DifferentialAnalysisItem>('/differential/compare', {
      extensionId,
      oldVersion,
      newVersion,
    }),

  getHistory: (extensionId: string) =>
    api.get<DifferentialAnalysisItem[]>(`/differential/${extensionId}/history`),

  getReport: (analysisId: string) =>
    api.get<DifferentialAnalysisItem & { supply_chain_events?: SupplyChainEventItem[] }>(
      `/differential/report/${analysisId}`
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