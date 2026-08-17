import { describe, it, expect } from 'vitest';
import { analyzeManifest, isHighRiskPermission, getPermissionRiskLevel } from '../services/manifest-analyzer';
import type { ExtensionManifest } from '@extension-guard/shared';

describe('Manifest Analyzer', () => {
  it('should classify critical and high risk permissions correctly', () => {
    expect(getPermissionRiskLevel('debugger')).toBe('critical');
    expect(getPermissionRiskLevel('cookies')).toBe('high');
    expect(getPermissionRiskLevel('webRequest')).toBe('high');
    expect(getPermissionRiskLevel('storage')).toBe('low');
    expect(getPermissionRiskLevel('notifications')).toBe('low');
    expect(isHighRiskPermission('debugger')).toBe(true);
    expect(isHighRiskPermission('cookies')).toBe(true);
    expect(isHighRiskPermission('storage')).toBe(false);
  });

  it('should analyze manifest and flag sensitive permissions and host patterns', async () => {
    const mockManifest: ExtensionManifest = {
      manifest_version: 3,
      name: 'Test Extension',
      version: '1.0.0',
      description: 'A test extension',
      permissions: ['cookies', 'storage', 'clipboardRead'],
      host_permissions: ['<all_urls>', '*://*.bankofamerica.com/*'],
      background: {
        service_worker: 'background.js',
        type: 'module',
      },
      content_scripts: [
        {
          matches: ['*://mail.google.com/*'],
          js: ['content.js'],
        },
      ],
    };

    const result = await analyzeManifest(mockManifest, 'scan-test-123');

    expect(result.errors).toHaveLength(0);
    expect(result.permissionRisks.length).toBeGreaterThanOrEqual(4);
    expect(result.evidences.length).toBeGreaterThanOrEqual(5);

    // Verify cookies flagged as high risk
    const cookiesRisk = result.permissionRisks.find(p => p.permission === 'cookies');
    expect(cookiesRisk).toBeDefined();
    expect(cookiesRisk?.risk_level).toBe('high');

    // Verify <all_urls> flagged as critical
    const allUrlsRisk = result.permissionRisks.find(p => p.permission === 'host:<all_urls>');
    expect(allUrlsRisk).toBeDefined();
    expect(allUrlsRisk?.risk_level).toBe('critical');

    // Verify banking host pattern flagged
    const bankRisk = result.permissionRisks.find(p => p.permission.includes('bankofamerica'));
    expect(bankRisk).toBeDefined();
    expect(bankRisk?.risk_level).toBe('critical');
    expect(result.manifestHash).toHaveLength(64);
  });

  it('should detect MV2 background scripts and flag insecure CSP policies', async () => {
    const mv2Manifest: ExtensionManifest = {
      manifest_version: 2,
      name: 'Legacy Extension',
      version: '2.1.0',
      description: 'MV2 Extension with insecure CSP',
      permissions: ['tabs'],
      background: {
        scripts: ['bg_helper.js', 'bg_main.js'],
        persistent: true,
      },
      content_security_policy: "script-src 'self' 'unsafe-eval' http://cdn.untrusted.com; object-src 'self'",
    };

    const result = await analyzeManifest(mv2Manifest, 'scan-mv2-test');

    expect(result.errors).toHaveLength(0);

    // Verify MV2 background scripts recorded in evidence
    const bgEvidence = result.evidences.find(e => e.source === 'background');
    expect(bgEvidence).toBeDefined();
    expect(bgEvidence?.description).toContain('bg_helper.js');

    // Verify insecure CSP flagged as high risk
    const cspRisk = result.permissionRisks.find(p => p.permission === 'csp:insecure_policy');
    expect(cspRisk).toBeDefined();
    expect(cspRisk?.risk_level).toBe('high');
  });
});
