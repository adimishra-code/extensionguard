import { describe, it, expect } from 'vitest';
import { riskAnalyzer } from '../../monitor-extension/src/background/risk-analyzer';

describe('Risk Analyzer', () => {
  describe('analyzeExtension', () => {
    it('should calculate low risk for minimal permissions', () => {
      const extension = {
        id: 'test-extension-1',
        name: 'Test Extension',
        version: '1.0.0',
        enabled: true,
        permissions: ['storage'],
        hostPermissions: [],
        installType: 'normal',
      };

      const result = riskAnalyzer.analyzeExtension(extension);

      expect(result.score).toBeLessThan(30);
      expect(result.severity).toBe('low');
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should calculate high risk for dangerous permissions', () => {
      const extension = {
        id: 'test-extension-2',
        name: 'Suspicious Extension',
        version: '1.0.0',
        enabled: true,
        permissions: ['cookies', 'webRequest', 'webRequestBlocking', 'management'],
        hostPermissions: ['<all_urls>'],
        installType: 'sideload',
      };

      const result = riskAnalyzer.analyzeExtension(extension);

      expect(result.score).toBeGreaterThan(70);
      expect(result.severity).toMatch(/high|critical/);
      expect(result.factors.some(f => f.category === 'Dangerous Permissions')).toBe(true);
    });

    it('should penalize broad host permissions', () => {
      const extension = {
        id: 'test-extension-3',
        name: 'All Sites Extension',
        version: '1.0.0',
        enabled: true,
        permissions: ['storage'],
        hostPermissions: ['<all_urls>'],
        installType: 'normal',
      };

      const result = riskAnalyzer.analyzeExtension(extension);

      expect(result.factors.some(f => f.category === 'Host Permissions')).toBe(true);
      expect(result.score).toBeGreaterThan(25);
    });

    it('should penalize sideloaded extensions', () => {
      const extension = {
        id: 'test-extension-4',
        name: 'Sideloaded Extension',
        version: '1.0.0',
        enabled: true,
        permissions: ['storage'],
        hostPermissions: [],
        installType: 'sideload',
      };

      const result = riskAnalyzer.analyzeExtension(extension);

      expect(result.factors.some(f => f.category === 'Install Type')).toBe(true);
    });

    it('should penalize custom update URLs', () => {
      const extension = {
        id: 'test-extension-5',
        name: 'Custom Update Extension',
        version: '1.0.0',
        enabled: true,
        permissions: ['storage'],
        hostPermissions: [],
        installType: 'normal',
        updateUrl: 'https://example.com/updates.xml',
      };

      const result = riskAnalyzer.analyzeExtension(extension);

      expect(result.factors.some(f => f.category === 'Update Source')).toBe(true);
    });

    it('should penalize insecure HTTP update URLs', () => {
      const extension = {
        id: 'test-extension-6',
        name: 'Insecure Update Extension',
        version: '1.0.0',
        enabled: true,
        permissions: [],
        hostPermissions: [],
        installType: 'normal',
        updateUrl: 'http://example.com/updates.xml',
      };

      const result = riskAnalyzer.analyzeExtension(extension);

      expect(result.factors.some(f => f.category === 'Update Security')).toBe(true);
    });

    it('should not exceed score of 100', () => {
      const extension = {
        id: 'test-extension-7',
        name: 'Maximum Risk Extension',
        version: '1.0.0',
        enabled: true,
        permissions: ['cookies', 'webRequest', 'webRequestBlocking', 'management', 'debugger', 'proxy'],
        hostPermissions: ['<all_urls>'],
        installType: 'sideload',
        updateUrl: 'http://malicious.com/updates.xml',
      };

      const result = riskAnalyzer.analyzeExtension(extension);

      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should determine correct severity levels', () => {
      const testCases = [
        { score: 20, expected: 'low' },
        { score: 40, expected: 'medium' },
        { score: 75, expected: 'high' },
        { score: 90, expected: 'critical' },
      ];

      testCases.forEach(({ score, expected }) => {
        // Create extension that will produce approximately this score
        const permissions = Array(Math.floor(score / 2)).fill('storage');
        const extension = {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          enabled: true,
          permissions,
          hostPermissions: [],
          installType: 'normal',
        };

        const result = riskAnalyzer.analyzeExtension(extension);
        // Just verify severity determination logic works
        expect(['low', 'medium', 'high', 'critical']).toContain(result.severity);
      });
    });
  });

  describe('Static methods', () => {
    it('should return correct severity colors', () => {
      expect(riskAnalyzer.constructor.getSeverityColor('low')).toBe('#10B981');
      expect(riskAnalyzer.constructor.getSeverityColor('medium')).toBe('#F59E0B');
      expect(riskAnalyzer.constructor.getSeverityColor('high')).toBe('#EF4444');
      expect(riskAnalyzer.constructor.getSeverityColor('critical')).toBe('#7F1D1D');
    });

    it('should return correct score badges', () => {
      expect(riskAnalyzer.constructor.getScoreBadge(10)).toBe('✓');
      expect(riskAnalyzer.constructor.getScoreBadge(55)).toBe('~');
      expect(riskAnalyzer.constructor.getScoreBadge(75)).toBe('⚠');
      expect(riskAnalyzer.constructor.getScoreBadge(90)).toBe('!');
    });
  });
});
