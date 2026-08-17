import { createHash } from 'crypto';
import { ExtensionManifest, PermissionRisk, Severity, Evidence } from '@extension-guard/shared';
import { logger } from '../utils/logger';

export interface ManifestAnalysisResult {
  permissionRisks: PermissionRisk[];
  evidences: Evidence[];
  manifestHash: string;
  errors: string[];
}

const PERMISSION_RISK_MAP: Record<string, { risk: Severity; reason: string }> = {
  'tabs': { risk: 'medium', reason: 'Can access tab information including URLs and titles' },
  'storage': { risk: 'low', reason: 'Can store data locally' },
  'cookies': { risk: 'high', reason: 'Can read and modify cookies across domains' },
  'webRequest': { risk: 'high', reason: 'Can intercept and modify network requests' },
  'webRequestBlocking': { risk: 'high', reason: 'Can block and redirect network requests' },
  'management': { risk: 'high', reason: 'Can manage other extensions and apps' },
  'history': { risk: 'high', reason: 'Can access browsing history' },
  'downloads': { risk: 'medium', reason: 'Can access and modify downloads' },
  'bookmarks': { risk: 'medium', reason: 'Can access and modify bookmarks' },
  'topSites': { risk: 'medium', reason: 'Can access top sites' },
  'clipboardRead': { risk: 'high', reason: 'Can read clipboard contents' },
  'clipboardWrite': { risk: 'medium', reason: 'Can write to clipboard' },
  'identity': { risk: 'high', reason: 'Can access user identity information' },
  'idle': { risk: 'low', reason: 'Can detect idle state' },
  'alarms': { risk: 'low', reason: 'Can schedule alarms' },
  'notifications': { risk: 'low', reason: 'Can show notifications' },
  'contextMenus': { risk: 'low', reason: 'Can add context menu items' },
  'geolocation': { risk: 'high', reason: 'Can access user location' },
  'nativeMessaging': { risk: 'high', reason: 'Can communicate with native applications' },
  'unlimitedStorage': { risk: 'medium', reason: 'Can store unlimited local data' },
  'background': { risk: 'low', reason: 'Can run background scripts' },
  'activeTab': { risk: 'medium', reason: 'Can access active tab on user interaction' },
  'scripting': { risk: 'high', reason: 'Can inject scripts into pages' },
  'declarativeNetRequest': { risk: 'medium', reason: 'Can declare network request rules' },
  'declarativeNetRequestWithHostAccess': { risk: 'high', reason: 'Can declare network rules with host access' },
  'debugger': { risk: 'critical', reason: 'Can debug pages - extremely powerful' },
  'fontSettings': { risk: 'low', reason: 'Can modify font settings' },
  'proxy': { risk: 'high', reason: 'Can configure proxy settings' },
  'tts': { risk: 'low', reason: 'Can use text-to-speech' },
  'ttsEngine': { risk: 'low', reason: 'Can provide text-to-speech engine' },
  'wallpaper': { risk: 'low', reason: 'Can set wallpaper' },
  'system.display': { risk: 'low', reason: 'Can access display information' },
  'system.memory': { risk: 'low', reason: 'Can access memory information' },
  'system.cpu': { risk: 'low', reason: 'Can access CPU information' },
  'system.storage': { risk: 'low', reason: 'Can access storage information' },
  'certificateProvider': { risk: 'high', reason: 'Can provide certificates' },
  'documentScan': { risk: 'high', reason: 'Can scan documents' },
  'enterprise.deviceAttributes': { risk: 'high', reason: 'Can access device attributes' },
  'enterprise.networkingAttributes': { risk: 'high', reason: 'Can access networking attributes' },
  'enterprise.platformKeys': { risk: 'high', reason: 'Can access platform keys' },
  'fileBrowserHandler': { risk: 'medium', reason: 'Can handle file browser events' },
  'fileSystemProvider': { risk: 'high', reason: 'Can provide file system access' },
  'hid': { risk: 'high', reason: 'Can access HID devices' },
  'serial': { risk: 'high', reason: 'Can access serial ports' },
  'usb': { risk: 'high', reason: 'Can access USB devices' },
  'bluetooth': { risk: 'high', reason: 'Can access Bluetooth devices' },
  'nfc': { risk: 'high', reason: 'Can access NFC devices' },
};

const SENSITIVE_HOST_PATTERNS: Array<{ pattern: string; category: string; risk: Severity }> = [
  { pattern: '*://mail.google.com/*', category: 'email', risk: 'high' },
  { pattern: '*://*.google.com/mail/*', category: 'email', risk: 'high' },
  { pattern: '*://outlook.office.com/*', category: 'email', risk: 'high' },
  { pattern: '*://*.outlook.com/*', category: 'email', risk: 'high' },
  { pattern: '*://*.bank.*/*', category: 'banking', risk: 'critical' },
  { pattern: '*://*.chase.com/*', category: 'banking', risk: 'critical' },
  { pattern: '*://*.wellsfargo.com/*', category: 'banking', risk: 'critical' },
  { pattern: '*://*.bankofamerica.com/*', category: 'banking', risk: 'critical' },
  { pattern: '*://*.citibank.com/*', category: 'banking', risk: 'critical' },
  { pattern: '*://*.paypal.com/*', category: 'payment', risk: 'high' },
  { pattern: '*://*.stripe.com/*', category: 'payment', risk: 'high' },
  { pattern: '*://github.com/*', category: 'development', risk: 'medium' },
  { pattern: '*://*.github.com/*', category: 'development', risk: 'medium' },
  { pattern: '*://gitlab.com/*', category: 'development', risk: 'medium' },
  { pattern: '*://*.gitlab.com/*', category: 'development', risk: 'medium' },
  { pattern: '*://aws.amazon.com/*', category: 'cloud', risk: 'high' },
  { pattern: '*://*.aws.amazon.com/*', category: 'cloud', risk: 'high' },
  { pattern: '*://console.cloud.google.com/*', category: 'cloud', risk: 'high' },
  { pattern: '*://portal.azure.com/*', category: 'cloud', risk: 'high' },
  { pattern: '*://*.facebook.com/*', category: 'social', risk: 'medium' },
  { pattern: '*://*.twitter.com/*', category: 'social', risk: 'medium' },
  { pattern: '*://*.linkedin.com/*', category: 'social', risk: 'medium' },
  { pattern: '*://*.instagram.com/*', category: 'social', risk: 'medium' },
  { pattern: '*://*.reddit.com/*', category: 'social', risk: 'medium' },
  { pattern: '<all_urls>', category: 'all_sites', risk: 'critical' },
  { pattern: '*://*/*', category: 'all_sites', risk: 'critical' },
  { pattern: 'https://*/*', category: 'all_https', risk: 'high' },
  { pattern: 'http://*/*', category: 'all_http', risk: 'high' },
];

function matchesPattern(url: string, pattern: string): boolean {
  if (pattern === '<all_urls>' || pattern === '*://*/*') return true;
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(url);
}

function analyzeHostPermission(pattern: string): { category: string; risk: Severity } {
  for (const sensitive of SENSITIVE_HOST_PATTERNS) {
    if (matchesPattern(pattern, sensitive.pattern)) {
      return { category: sensitive.category, risk: sensitive.risk };
    }
  }
  return { category: 'other', risk: 'low' };
}

function calculateManifestHash(manifest: ExtensionManifest): string {
  const normalized = JSON.stringify(manifest, Object.keys(manifest).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

export async function analyzeManifest(
  manifest: ExtensionManifest,
  scanId: string
): Promise<ManifestAnalysisResult> {
  const logger_ = logger.child({ scanId, service: 'manifest-analyzer' });
  const permissionRisks: PermissionRisk[] = [];
  const evidences: Evidence[] = [];
  const errors: string[] = [];
  let evidenceCounter = 0;

  function nextEvidenceId() {
    return `E-${scanId.slice(0, 8)}-${(++evidenceCounter).toString().padStart(3, '0')}`;
  }

  try {
    const allPermissions = [
      ...(manifest.permissions || []),
      ...(manifest.optional_permissions || []),
    ];

    for (const permission of allPermissions) {
      const riskInfo = PERMISSION_RISK_MAP[permission];
      const evidenceId = nextEvidenceId();

      if (riskInfo) {
        permissionRisks.push({
          id: evidenceId,
          scan_id: scanId,
          permission,
          risk_level: riskInfo.risk,
          reason: riskInfo.reason,
          used_in_code: null,
          evidence_ids: [evidenceId],
        });

        evidences.push({
          id: evidenceId,
          scan_id: scanId,
          type: 'manifest',
          source: 'permission',
          description: `Permission declared: ${permission}`,
          raw_data: { permission, risk_level: riskInfo.risk, reason: riskInfo.reason },
          confidence: 'confirmed',
          created_at: new Date().toISOString(),
        });
      } else {
        permissionRisks.push({
          id: evidenceId,
          scan_id: scanId,
          permission,
          risk_level: 'info',
          reason: 'Unknown or custom permission',
          used_in_code: null,
          evidence_ids: [evidenceId],
        });

        evidences.push({
          id: evidenceId,
          scan_id: scanId,
          type: 'manifest',
          source: 'permission',
          description: `Unknown permission declared: ${permission}`,
          raw_data: { permission, risk_level: 'info' },
          confidence: 'potential',
          created_at: new Date().toISOString(),
        });
      }
    }

    for (const hostPerm of manifest.host_permissions || []) {
      const evidenceId = nextEvidenceId();
      const { category, risk } = analyzeHostPermission(hostPerm);

      permissionRisks.push({
        id: evidenceId,
        scan_id: scanId,
        permission: `host:${hostPerm}`,
        risk_level: risk,
        reason: `Host permission grants access to ${category} sites`,
        used_in_code: null,
        evidence_ids: [evidenceId],
      });

      evidences.push({
        id: evidenceId,
        scan_id: scanId,
        type: 'manifest',
        source: 'host_permission',
        description: `Host permission: ${hostPerm} (${category})`,
        raw_data: { host_permission: hostPerm, category, risk_level: risk },
        confidence: 'confirmed',
        created_at: new Date().toISOString(),
      });
    }

    if (manifest.content_scripts) {
      for (const cs of manifest.content_scripts) {
        for (const match of cs.matches) {
          const evidenceId = nextEvidenceId();
          const { category, risk } = analyzeHostPermission(match);

          evidences.push({
            id: evidenceId,
            scan_id: scanId,
            type: 'manifest',
            source: 'content_script',
            description: `Content script injected on: ${match}`,
            raw_data: {
              matches: cs.matches,
              run_at: cs.run_at,
              world: cs.world,
              all_frames: cs.all_frames,
              category,
              risk_level: risk,
            },
            confidence: 'confirmed',
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    // Manifest V3 background service worker
    if (manifest.background?.service_worker) {
      const evidenceId = nextEvidenceId();
      evidences.push({
        id: evidenceId,
        scan_id: scanId,
        type: 'manifest',
        source: 'background',
        description: `Service worker background script: ${manifest.background.service_worker}`,
        raw_data: { service_worker: manifest.background.service_worker, type: manifest.background.type },
        confidence: 'confirmed',
        created_at: new Date().toISOString(),
      });
    }

    // Manifest V2 background scripts or page
    if (manifest.background?.scripts && manifest.background.scripts.length > 0) {
      const evidenceId = nextEvidenceId();
      evidences.push({
        id: evidenceId,
        scan_id: scanId,
        type: 'manifest',
        source: 'background',
        description: `Background scripts (MV2): ${manifest.background.scripts.join(', ')}`,
        raw_data: { scripts: manifest.background.scripts, persistent: manifest.background.persistent },
        confidence: 'confirmed',
        created_at: new Date().toISOString(),
      });
    } else if (manifest.background?.page) {
      const evidenceId = nextEvidenceId();
      evidences.push({
        id: evidenceId,
        scan_id: scanId,
        type: 'manifest',
        source: 'background',
        description: `Background page (MV2): ${manifest.background.page}`,
        raw_data: { page: manifest.background.page, persistent: manifest.background.persistent },
        confidence: 'confirmed',
        created_at: new Date().toISOString(),
      });
    }

    if (manifest.externally_connectable?.matches) {
      for (const match of manifest.externally_connectable.matches) {
        const evidenceId = nextEvidenceId();
        evidences.push({
          id: evidenceId,
          scan_id: scanId,
          type: 'manifest',
          source: 'externally_connectable',
          description: `Externally connectable: ${match}`,
          raw_data: { match, ids: manifest.externally_connectable.ids },
          confidence: 'confirmed',
          created_at: new Date().toISOString(),
        });
      }
    }

    if (manifest.content_security_policy) {
      const evidenceId = nextEvidenceId();
      const cspStr = typeof manifest.content_security_policy === 'string'
        ? manifest.content_security_policy
        : JSON.stringify(manifest.content_security_policy);

      const hasUnsafeEval = cspStr.includes("'unsafe-eval'");
      const hasHttpRemote = /http:\/\/[^\s;]+/i.test(cspStr);

      if (hasUnsafeEval || hasHttpRemote) {
        permissionRisks.push({
          id: evidenceId,
          scan_id: scanId,
          permission: 'csp:insecure_policy',
          risk_level: 'high',
          reason: hasUnsafeEval 
            ? "Content Security Policy contains 'unsafe-eval' which allows dynamic string execution"
            : 'Content Security Policy allows insecure plaintext HTTP remote script loading',
          used_in_code: null,
          evidence_ids: [evidenceId],
        });
      }

      evidences.push({
        id: evidenceId,
        scan_id: scanId,
        type: 'manifest',
        source: 'csp',
        description: hasUnsafeEval ? "Insecure Content Security Policy (allows 'unsafe-eval')" : 'Content Security Policy defined',
        raw_data: { csp: manifest.content_security_policy, insecure: hasUnsafeEval || hasHttpRemote },
        confidence: 'confirmed',
        created_at: new Date().toISOString(),
      });
    }

    const manifestHash = calculateManifestHash(manifest);
    logger_.info({ permissionCount: permissionRisks.length, evidenceCount: evidences.length }, 'Manifest analysis complete');

    return {
      permissionRisks,
      evidences,
      manifestHash,
      errors,
    };
  } catch (error) {
    logger_.error({ error }, 'Manifest analysis failed');
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return {
      permissionRisks,
      evidences,
      manifestHash: '',
      errors,
    };
  }
}

export function getPermissionRiskLevel(permission: string): Severity {
  return PERMISSION_RISK_MAP[permission]?.risk || 'info';
}

export function isHighRiskPermission(permission: string): boolean {
  const risk = getPermissionRiskLevel(permission);
  return ['high', 'critical'].includes(risk);
}

export function getAllHighRiskPermissions(): string[] {
  return Object.entries(PERMISSION_RISK_MAP)
    .filter(([, v]) => ['high', 'critical'].includes(v.risk))
    .map(([k]) => k);
}