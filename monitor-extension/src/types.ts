// Shared types between extension and backend
export interface Extension {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  permissions: string[];
  hostPermissions: string[];
  installType: string;
  updateUrl?: string;
  homepageUrl?: string;
  icons?: { size: number; url: string }[];
}

export interface MonitoringEvent {
  type: 'register' | 'extension_installed' | 'extension_updated' | 'extension_removed' | 'extension_enabled' | 'extension_disabled' | 'network_request' | 'ping';
  timestamp: number;
  clientId?: string;
  userAgent?: string;
  extensions?: Extension[];
  extensionId?: string;
  oldVersion?: string;
  newVersion?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface ServerMessage {
  type: 'risk_update' | 'alert' | 'scan_complete' | 'pong';
  extensionId?: string;
  riskScore?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  reasons?: string[];
  message?: string;
  actionRequired?: boolean;
  scanId?: string;
  reportUrl?: string;
  timestamp: number;
}

export interface RiskScore {
  extensionId: string;
  score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  lastUpdated: number;
}

export interface Alert {
  id: string;
  extensionId: string;
  extensionName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  read: boolean;
  actionRequired: boolean;
}

export interface Config {
  apiUrl: string;
  apiKey?: string;
  syncEnabled: boolean;
  alertLevel: 'all' | 'high' | 'critical';
  scanFrequency: number; // minutes
}
