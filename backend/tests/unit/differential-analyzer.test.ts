import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma (already done globally in setup.ts, but explicit here for clarity)
vi.mock('../../src/utils/prisma');

// ─── Inline differential comparison logic for unit testing ───────────────────
// Mirrors the logic in src/services/differential-analyzer.ts

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

const DANGEROUS_PERMISSIONS: Record<string, number> = {
  '<all_urls>': 25,
  'cookies': 15,
  'webRequest': 15,
  'webRequestBlocking': 15,
  'management': 20,
  'debugger': 20,
  'proxy': 15,
  'nativeMessaging': 10,
  'history': 8,
  'bookmarks': 5,
  'tabs': 5,
  'storage': 2,
  'alarms': 1,
  'notifications': 2,
};

function calculatePermissionRisk(permissions: string[]): number {
  return permissions.reduce((sum, p) => sum + (DANGEROUS_PERMISSIONS[p] ?? 3), 0);
}

function calculateHostPermissionRisk(hostPerms: string[]): number {
  return hostPerms.reduce((sum, p) => {
    if (p === '<all_urls>' || p === '*://*/*') return sum + 25;
    return sum + 5;
  }, 0);
}

function determineSeverity(delta: number): Severity {
  if (delta >= 50) return 'critical';
  if (delta >= 30) return 'high';
  if (delta >= 10) return 'medium';
  return 'low';
}

function generateSummary(changes: {
  permissionsAdded: string[];
  permissionsRemoved: string[];
  hostPermissionsAdded: string[];
  hostPermissionsRemoved: string[];
}): string {
  const parts: string[] = [];

  if (changes.permissionsAdded.length > 0) {
    parts.push(`Added permissions: ${changes.permissionsAdded.join(', ')}`);
  }
  if (changes.permissionsRemoved.length > 0) {
    parts.push(`Removed permissions: ${changes.permissionsRemoved.join(', ')}`);
  }
  if (changes.hostPermissionsAdded.includes('<all_urls>')) {
    parts.push('Now requests access to all sites');
  }
  if (changes.hostPermissionsRemoved.length > 0) {
    parts.push(`Removed host access for: ${changes.hostPermissionsRemoved.join(', ')}`);
  }
  return parts.join('. ') || 'No significant changes.';
}

function compareVersions(
  oldV: { permissions: string[]; host_permissions: string[] },
  newV: { permissions: string[]; host_permissions: string[] }
) {
  const permissionsAdded = newV.permissions.filter(p => !oldV.permissions.includes(p));
  const permissionsRemoved = oldV.permissions.filter(p => !newV.permissions.includes(p));
  const hostPermissionsAdded = newV.host_permissions.filter(p => !oldV.host_permissions.includes(p));
  const hostPermissionsRemoved = oldV.host_permissions.filter(p => !newV.host_permissions.includes(p));

  const addedRisk = calculatePermissionRisk(permissionsAdded) + calculateHostPermissionRisk(hostPermissionsAdded);
  const removedRisk = calculatePermissionRisk(permissionsRemoved) + calculateHostPermissionRisk(hostPermissionsRemoved);
  const riskDelta = addedRisk - removedRisk;

  return {
    permissionsAdded,
    permissionsRemoved,
    hostPermissionsAdded,
    hostPermissionsRemoved,
    riskDelta,
    severity: determineSeverity(Math.abs(riskDelta)),
    summary: generateSummary({ permissionsAdded, permissionsRemoved, hostPermissionsAdded, hostPermissionsRemoved }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Differential Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Permission comparison logic', () => {
    it('should detect added permissions', () => {
      const oldPermissions = ['storage', 'tabs'];
      const newPermissions = ['storage', 'tabs', 'cookies'];

      const added = newPermissions.filter(p => !oldPermissions.includes(p));
      const removed = oldPermissions.filter(p => !newPermissions.includes(p));

      expect(added).toContain('cookies');
      expect(removed).toHaveLength(0);
    });

    it('should detect removed permissions', () => {
      const result = compareVersions(
        { permissions: ['storage', 'tabs', 'cookies'], host_permissions: [] },
        { permissions: ['storage', 'tabs'], host_permissions: [] }
      );

      expect(result.permissionsRemoved).toContain('cookies');
      expect(result.permissionsAdded).toHaveLength(0);
      expect(result.riskDelta).toBeLessThan(0);
    });

    it('should detect added host permissions', () => {
      const result = compareVersions(
        { permissions: ['storage'], host_permissions: ['https://example.com/*'] },
        { permissions: ['storage'], host_permissions: ['https://example.com/*', '<all_urls>'] }
      );

      expect(result.hostPermissionsAdded).toContain('<all_urls>');
      expect(result.riskDelta).toBeGreaterThan(0);
      // 25 risk delta puts this at 'medium' or above
      expect(['medium', 'high', 'critical']).toContain(result.severity);
    });

    it('should calculate correct risk delta for dangerous permissions', () => {
      const result = compareVersions(
        { permissions: ['storage'], host_permissions: [] },
        { permissions: ['storage', 'webRequest', 'cookies'], host_permissions: ['<all_urls>'] }
      );

      expect(result.riskDelta).toBeGreaterThan(30);
      expect(result.severity).toMatch(/high|critical/);
    });

    it('should determine severity based on risk delta', () => {
      expect(determineSeverity(5)).toBe('low');
      expect(determineSeverity(15)).toBe('medium');
      expect(determineSeverity(35)).toBe('high');
      expect(determineSeverity(55)).toBe('critical');
    });

    it('should handle no changes', () => {
      const version = { permissions: ['storage', 'tabs'], host_permissions: ['https://example.com/*'] };
      const result = compareVersions(version, version);

      expect(result.permissionsAdded).toHaveLength(0);
      expect(result.permissionsRemoved).toHaveLength(0);
      expect(result.riskDelta).toBe(0);
      expect(result.severity).toBe('low');
    });

    it('should handle empty permissions', () => {
      const result = compareVersions(
        { permissions: [], host_permissions: [] },
        { permissions: ['storage'], host_permissions: [] }
      );

      expect(result.permissionsAdded).toContain('storage');
      expect(result.riskDelta).toBeGreaterThan(0);
    });
  });

  describe('Risk calculation', () => {
    it('should assign high risk to dangerous permissions', () => {
      ['cookies', 'webRequest', 'debugger', 'management'].forEach(perm => {
        const risk = calculatePermissionRisk([perm]);
        expect(risk).toBeGreaterThanOrEqual(10);
      });
    });

    it('should assign low risk to safe permissions', () => {
      ['storage', 'alarms', 'notifications'].forEach(perm => {
        const risk = calculatePermissionRisk([perm]);
        expect(risk).toBeLessThanOrEqual(5);
      });
    });

    it('should assign critical risk to <all_urls>', () => {
      expect(calculateHostPermissionRisk(['<all_urls>'])).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Summary generation', () => {
    it('should mention added permissions in summary', () => {
      const summary = generateSummary({
        permissionsAdded: ['cookies', 'webRequest'],
        permissionsRemoved: [],
        hostPermissionsAdded: [],
        hostPermissionsRemoved: [],
      });
      expect(summary.toLowerCase()).toContain('permission');
      expect(summary.toLowerCase()).toContain('cookie');
    });

    it('should mention broad host access in summary', () => {
      const summary = generateSummary({
        permissionsAdded: [],
        permissionsRemoved: [],
        hostPermissionsAdded: ['<all_urls>'],
        hostPermissionsRemoved: [],
      });
      expect(summary.toLowerCase()).toContain('all');
      expect(summary.toLowerCase()).toContain('site');
    });

    it('should indicate removed permissions', () => {
      const summary = generateSummary({
        permissionsAdded: [],
        permissionsRemoved: ['cookies'],
        hostPermissionsAdded: [],
        hostPermissionsRemoved: [],
      });
      expect(summary.toLowerCase()).toContain('removed');
    });
  });
});
