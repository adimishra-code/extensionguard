import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../../src/utils/prisma';

// Mock Prisma
vi.mock('../../src/utils/prisma', () => ({
  prisma: {
    extensionVersion: {
      findUnique: vi.fn(),
    },
    differentialAnalysis: {
      create: vi.fn(),
    },
  },
}));

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
      const oldVersion = {
        permissions: ['storage', 'tabs', 'cookies'],
        host_permissions: [],
      };

      const newVersion = {
        permissions: ['storage', 'tabs'],
        host_permissions: [],
      };

      const result = differentialAnalyzer.compareVersions(oldVersion, newVersion);

      expect(result.permissionsRemoved).toContain('cookies');
      expect(result.permissionsAdded).toHaveLength(0);
      expect(result.riskDelta).toBeLessThan(0);
    });

    it('should detect added host permissions', () => {
      const oldVersion = {
        permissions: ['storage'],
        host_permissions: ['https://example.com/*'],
      };

      const newVersion = {
        permissions: ['storage'],
        host_permissions: ['https://example.com/*', '<all_urls>'],
      };

      const result = differentialAnalyzer.compareVersions(oldVersion, newVersion);

      expect(result.hostPermissionsAdded).toContain('<all_urls>');
      expect(result.riskDelta).toBeGreaterThan(0);
      expect(result.severity).toMatch(/high|critical/);
    });

    it('should calculate correct risk delta for dangerous permissions', () => {
      const oldVersion = {
        permissions: ['storage'],
        host_permissions: [],
      };

      const newVersion = {
        permissions: ['storage', 'webRequest', 'cookies'],
        host_permissions: ['<all_urls>'],
      };

      const result = differentialAnalyzer.compareVersions(oldVersion, newVersion);

      expect(result.riskDelta).toBeGreaterThan(30);
      expect(result.severity).toMatch(/high|critical/);
    });

    it('should determine severity based on risk delta', () => {
      const testCases = [
        { delta: 5, expectedSeverity: 'low' },
        { delta: 15, expectedSeverity: 'medium' },
        { delta: 35, expectedSeverity: 'high' },
        { delta: 55, expectedSeverity: 'critical' },
      ];

      testCases.forEach(({ delta, expectedSeverity }) => {
        const severity = differentialAnalyzer.determineSeverity(delta);
        expect(severity).toBe(expectedSeverity);
      });
    });

    it('should generate appropriate summary for changes', () => {
      const oldVersion = {
        permissions: ['storage'],
        host_permissions: [],
      };

      const newVersion = {
        permissions: ['storage', 'cookies', 'webRequest'],
        host_permissions: ['<all_urls>'],
      };

      const result = differentialAnalyzer.compareVersions(oldVersion, newVersion);

      expect(result.summary).toBeTruthy();
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('should handle no changes', () => {
      const version = {
        permissions: ['storage', 'tabs'],
        host_permissions: ['https://example.com/*'],
      };

      const result = differentialAnalyzer.compareVersions(version, version);

      expect(result.permissionsAdded).toHaveLength(0);
      expect(result.permissionsRemoved).toHaveLength(0);
      expect(result.riskDelta).toBe(0);
      expect(result.severity).toBe('low');
    });

    it('should handle empty permissions', () => {
      const oldVersion = {
        permissions: [],
        host_permissions: [],
      };

      const newVersion = {
        permissions: ['storage'],
        host_permissions: [],
      };

      const result = differentialAnalyzer.compareVersions(oldVersion, newVersion);

      expect(result.permissionsAdded).toContain('storage');
      expect(result.riskDelta).toBeGreaterThan(0);
    });
  });

  describe('Risk calculation', () => {
    it('should assign high risk to dangerous permissions', () => {
      const dangerousPermissions = ['cookies', 'webRequest', 'debugger', 'management'];

      dangerousPermissions.forEach(perm => {
        const risk = differentialAnalyzer.calculatePermissionRisk([perm]);
        expect(risk).toBeGreaterThanOrEqual(10);
      });
    });

    it('should assign low risk to safe permissions', () => {
      const safePermissions = ['storage', 'alarms', 'notifications'];

      safePermissions.forEach(perm => {
        const risk = differentialAnalyzer.calculatePermissionRisk([perm]);
        expect(risk).toBeLessThanOrEqual(5);
      });
    });

    it('should assign critical risk to <all_urls>', () => {
      const risk = differentialAnalyzer.calculateHostPermissionRisk(['<all_urls>']);
      expect(risk).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Summary generation', () => {
    it('should mention added dangerous permissions in summary', () => {
      const changes = {
        permissionsAdded: ['cookies', 'webRequest'],
        permissionsRemoved: [],
        hostPermissionsAdded: [],
        hostPermissionsRemoved: [],
      };

      const summary = differentialAnalyzer.generateSummary(changes);

      expect(summary.toLowerCase()).toContain('permission');
      expect(summary.toLowerCase()).toContain('cookie');
    });

    it('should mention broad host access in summary', () => {
      const changes = {
        permissionsAdded: [],
        permissionsRemoved: [],
        hostPermissionsAdded: ['<all_urls>'],
        hostPermissionsRemoved: [],
      };

      const summary = differentialAnalyzer.generateSummary(changes);

      expect(summary.toLowerCase()).toContain('all');
      expect(summary.toLowerCase()).toContain('site');
    });

    it('should indicate removed permissions positively', () => {
      const changes = {
        permissionsAdded: [],
        permissionsRemoved: ['cookies'],
        hostPermissionsAdded: [],
        hostPermissionsRemoved: [],
      };

      const summary = differentialAnalyzer.generateSummary(changes);

      expect(summary.toLowerCase()).toContain('removed');
    });
  });
});
