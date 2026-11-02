import { describe, it, expect, vi } from 'vitest';
import { LLMAnalyzerService } from '../../src/services/llm-analyzer';
import { LLMAnalysisInput, LLMAnalysisOutput } from '@extension-guard/shared';

describe('LLMAnalyzerService', () => {
  const service = new LLMAnalyzerService();

  const mockBaseInput: LLMAnalysisInput = {
    extension: {
      id: 'test-ext-id',
      name: 'Calculator Plus',
      version: '1.0.0',
    },
    purpose: 'A simple popup calculator for quick math operations in your browser.',
    privacy_policy_summary: 'We do not collect or store any user data.',
    permissions: [
      {
        id: 'perm-1',
        permission: 'storage',
        risk_level: 'low',
        reason: 'Store calculator history',
        evidence_ids: [],
      },
    ],
    code_findings: [],
    runtime_events: [],
  };

  describe('analyzeWithHeuristics', () => {
    it('returns low risk and no mismatches for legitimate utility with minimal permissions', () => {
      const result = service.analyzeWithHeuristics(mockBaseInput);

      expect(result.risk_assessment.severity).toBe('low');
      expect(result.behavioral_mismatch).toHaveLength(0);
      expect(result.summary).toContain('largely consistent');
      expect(result.recommended_actions.length).toBeGreaterThan(0);
    });

    it('flags purpose mismatch when simple calculator requests cookies and broad host access', () => {
      const suspiciousInput: LLMAnalysisInput = {
        ...mockBaseInput,
        permissions: [
          {
            id: 'perm-1',
            permission: 'cookies',
            risk_level: 'high',
            reason: 'Read browser cookies',
            evidence_ids: [],
          },
          {
            id: 'perm-2',
            permission: '<all_urls>',
            risk_level: 'critical',
            reason: 'Access all websites',
            evidence_ids: [],
          },
        ],
      };

      const result = service.analyzeWithHeuristics(suspiciousInput);

      expect(result.risk_assessment.severity).toBe('high');
      expect(result.behavioral_mismatch.length).toBeGreaterThan(0);
      expect(result.behavioral_mismatch[0].description).toMatch(/disproportionate|unnecessary|cookie/i);
      expect(result.key_findings.some(f => f.severity === 'high')).toBe(true);
    });

    it('identifies dynamic code execution (eval) as high severity MV3 violation', () => {
      const rceInput: LLMAnalysisInput = {
        ...mockBaseInput,
        code_findings: [
          {
            id: 'finding-eval-1',
            category: 'remote_code_execution',
            severity: 'high',
            file_path: 'calc.js',
            line: 42,
            column: 10,
            api: 'eval',
            pattern: 'eval(...)',
            confidence: 'confirmed',
            context: 'eval(userInputString)',
            ast_node_type: 'CallExpression',
          },
        ],
      };

      const result = service.analyzeWithHeuristics(rceInput);

      expect(result.key_findings.some(f => f.claim.includes('dynamic code evaluation'))).toBe(true);
      expect(result.recommended_actions.some(r => r.includes('eval()'))).toBe(true);
    });

    it('detects privacy policy contradictions when telemetry code is present despite zero-collection claim', () => {
      const exfilInput: LLMAnalysisInput = {
        ...mockBaseInput,
        privacy_policy_summary: 'Claims no data collected or transmitted.',
        code_findings: [
          {
            id: 'finding-exfil-1',
            category: 'network_exfiltration',
            severity: 'medium',
            file_path: 'analytics.js',
            line: 12,
            column: 5,
            api: 'fetch',
            pattern: 'fetch to third party',
            confidence: 'confirmed',
            context: 'fetch("https://analytics.tracker.xyz/collect", { method: "POST", body: data })',
            ast_node_type: 'CallExpression',
          },
        ],
      };

      const result = service.analyzeWithHeuristics(exfilInput);

      expect(result.behavioral_mismatch.some(m => m.description.includes('Privacy policy claims zero data collection'))).toBe(true);
    });
  });

  describe('calculateMismatchScore', () => {
    it('returns 0 when there are no behavioral mismatches', () => {
      const output: LLMAnalysisOutput = {
        summary: 'All clear',
        risk_assessment: { severity: 'low', confidence: 'likely' },
        key_findings: [],
        behavioral_mismatch: [],
        recommended_actions: [],
      };

      expect(service.calculateMismatchScore(output)).toBe(0);
    });

    it('calculates score based on mismatch count and severity', () => {
      const highOutput: LLMAnalysisOutput = {
        summary: 'Issues detected',
        risk_assessment: { severity: 'high', confidence: 'likely' },
        key_findings: [],
        behavioral_mismatch: [{ description: 'Mismatch 1', evidence_ids: [] }],
        recommended_actions: [],
      };

      // 35 + 1 * 20 = 55
      expect(service.calculateMismatchScore(highOutput)).toBe(55);

      const criticalOutput: LLMAnalysisOutput = {
        summary: 'Critical issues',
        risk_assessment: { severity: 'critical', confidence: 'likely' },
        key_findings: [],
        behavioral_mismatch: [
          { description: 'Mismatch 1', evidence_ids: [] },
          { description: 'Mismatch 2', evidence_ids: [] },
        ],
        recommended_actions: [],
      };

      // 50 + 2 * 25 = 100
      expect(service.calculateMismatchScore(criticalOutput)).toBe(100);
    });
  });

  describe('analyze (end-to-end fallback)', () => {
    it('falls back seamlessly to heuristic engine when no remote API key is configured', async () => {
      const analysis = await service.analyze(mockBaseInput);

      expect(analysis.provider).toBe('semantic-heuristic-v1');
      expect(analysis.model).toBe('rule-based-reasoner');
      expect(analysis.output).toBeDefined();
      expect(analysis.output.summary).toBeDefined();
      expect(typeof analysis.purposeMismatchScore).toBe('number');
    });
  });
});

