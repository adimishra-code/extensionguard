import axios from 'axios';
import type { Scan, Extension, Finding, ScanType } from '@extension-guard/shared';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export const scansApi = {
  list: (params?: { limit?: number; offset?: number; status?: string; type?: string }) =>
    api.get<{ scans: Scan[]; total: number }>('/scans', { params }),
  
  get: (id: string) =>
    api.get<Scan>(`/scans/${id}`),
  
  create: (file: File, scanType: ScanType = 'quick') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scanType', scanType);
    return api.post<{ scan_id: string; extension_id: string; status: string; message: string }>('/scans', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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

export default api;