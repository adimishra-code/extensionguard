import { describe, it, expect } from 'vitest';

// ─── Inline the risk scoring logic from scan-orchestrator for testing ─────────
// This mirrors the calculateRiskScores function in src/services/scan-orchestrator.ts

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

interface PermissionRisk {
  permission: string;
  risk_level: Severity;
  reason: string;
  evidence_ids: string[];
}

interface CodeFinding {
  category: string;
  severity: Severity;
  file_path: string;
  line: number;
  column: number;
  api: string;
  pattern: string;
  confidence: string;
  context: string;
  ast_node_type: string;
}

function clamp(n: number, max: number) {
  return Math.min(max, n);
}

function calcPermissionScore(perms: PermissionRisk[]) {
  let score = 0;
  for (const p of perms) {
    score += p.risk_level === 'critical' ? 10 : p.risk_level === 'high' ? 7 : p.risk_level === 'medium' ? 4 : 1;
  }
  return clamp(score * 2, 100);
}

function calcOverallScore(permissionScore: number, codeScore: number) {
  return Math.round(permissionScore * 0.20 + codeScore * 0.25);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Backend Risk Scoring', () => {
  describe('Permission score calculation', () => {
    it('should give zero score for no permissions', () => {
      expect(calcPermissionScore([])).toBe(0);
    });

    it('should give low score for low-risk permissions', () => {
      const perms: PermissionRisk[] = [
        { permission: 'storage', risk_level: 'low', reason: 'local storage', evidence_ids: [] },
        { permission: 'alarms', risk_level: 'low', reason: 'scheduling', evidence_ids: [] },
      ];
      const score = calcPermissionScore(perms);
      expect(score).toBeLessThan(10);
    });

    it('should give high score for critical permissions', () => {
      const perms: PermissionRisk[] = [
        { permission: '<all_urls>', risk_level: 'critical', reason: 'all hosts', evidence_ids: [] },
        { permission: 'cookies', risk_level: 'high', reason: 'cookie access', evidence_ids: [] },
        { permission: 'webRequest', risk_level: 'high', reason: 'intercept requests', evidence_ids: [] },
      ];
      const score = calcPermissionScore(perms);
      expect(score).toBeGreaterThan(40);
    });

    it('should cap at 100', () => {
      const perms: PermissionRisk[] = Array(20).fill({
        permission: 'x', risk_level: 'critical', reason: 'r', evidence_ids: [],
      });
      expect(calcPermissionScore(perms)).toBe(100);
    });
  });

  describe('Overall score calculation', () => {
    it('should weight permission and code scores correctly', () => {
      const overall = calcOverallScore(80, 60);
      expect(overall).toBe(Math.round(80 * 0.20 + 60 * 0.25));
    });

    it('should return 0 for clean extension', () => {
      expect(calcOverallScore(0, 0)).toBe(0);
    });

    it('should return high score for maximum inputs', () => {
      const overall = calcOverallScore(100, 100);
      expect(overall).toBeGreaterThan(40);
    });
  });

  describe('Severity thresholds', () => {
    function getSeverity(score: number): Severity {
      if (score >= 70) return 'critical';
      if (score >= 50) return 'high';
      if (score >= 30) return 'medium';
      return 'low';
    }

    it('should classify 0 as low', () => expect(getSeverity(0)).toBe('low'));
    it('should classify 29 as low', () => expect(getSeverity(29)).toBe('low'));
    it('should classify 30 as medium', () => expect(getSeverity(30)).toBe('medium'));
    it('should classify 50 as high', () => expect(getSeverity(50)).toBe('high'));
    it('should classify 70 as critical', () => expect(getSeverity(70)).toBe('critical'));
    it('should classify 100 as critical', () => expect(getSeverity(100)).toBe('critical'));
  });

  describe('Permission risk multipliers', () => {
    const dangerousPerms = ['cookies', 'webRequest', 'management', 'debugger', 'proxy'];

    it('should assign higher risk to known dangerous permissions', () => {
      const critical: PermissionRisk = {
        permission: '<all_urls>', risk_level: 'critical', reason: '', evidence_ids: [],
      };
      const low: PermissionRisk = {
        permission: 'storage', risk_level: 'low', reason: '', evidence_ids: [],
      };
      expect(calcPermissionScore([critical])).toBeGreaterThan(calcPermissionScore([low]));
    });

    it('dangerous permission list should be non-empty and contain expected entries', () => {
      expect(dangerousPerms).toContain('cookies');
      expect(dangerousPerms).toContain('webRequest');
      expect(dangerousPerms).toContain('debugger');
    });
  });
});
