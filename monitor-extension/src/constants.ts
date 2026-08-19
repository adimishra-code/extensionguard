export const DEFAULT_CONFIG = {
  apiUrl: import.meta.env.DEV ? 'http://localhost:3001' : 'https://api.extensionguard.dev',
  syncEnabled: true,
  alertLevel: 'high' as const,
  scanFrequency: 60, // Check every hour
};

export const RISK_THRESHOLDS = {
  low: 30,
  medium: 50,
  high: 70,
  critical: 85,
};

export const DANGEROUS_PERMISSIONS = [
  'cookies',
  'webRequest',
  'webRequestBlocking',
  'proxy',
  'debugger',
  'management',
  'nativeMessaging',
  'privacy',
  'processes',
  'signedInDevices',
  'tabCapture',
  'topSites',
  'browsingData',
  '<all_urls>',
];

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  cookies: 'Access browser cookies',
  webRequest: 'Monitor network requests',
  webRequestBlocking: 'Block or modify network requests',
  proxy: 'Control proxy settings',
  debugger: 'Debug other extensions',
  management: 'Manage other extensions',
  tabs: 'Access open tabs',
  storage: 'Store data locally',
  notifications: 'Show notifications',
  alarms: 'Schedule tasks',
  '<all_urls>': 'Access all websites',
};
