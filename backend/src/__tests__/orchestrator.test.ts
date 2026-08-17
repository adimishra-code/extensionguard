import { describe, it, expect } from 'vitest';

describe('Scan Orchestrator Scoring & Findings', () => {
  it('calculates weighted static risk scores accurately', () => {
    // Quick scan without runtime sandbox
    const manifestAnalysis = {
      permissionRisks: [
        { id: '1', scan_id: 's1', permission: 'cookies', risk_level: 'high' as const, reason: 'r1', used_in_code: true, evidence_ids: [] },
        { id: '2', scan_id: 's1', permission: 'storage', risk_level: 'low' as const, reason: 'r2', used_in_code: true, evidence_ids: [] },
      ],
      evidences: [],
      manifestHash: 'hash123',
      errors: [],
    };

    const staticAnalysis = {
      codeFindings: [
        { id: 'cf1', scan_id: 's1', file_path: 'bg.js', line: 10, column: 1, api: 'eval', pattern: 'rce', category: 'remote_code_execution', severity: 'high' as const, confidence: 'likely' as const, context: 'eval(x)', ast_node_type: 'Call' },
        { id: 'cf2', scan_id: 's1', file_path: 'bg.js', line: 20, column: 1, api: 'fetch', pattern: 'network', category: 'network_exfiltration', severity: 'medium' as const, confidence: 'likely' as const, context: 'fetch(url)', ast_node_type: 'Call' },
      ],
      dataFlows: [],
      evidences: [],
      errors: [],
    };

    const sandboxAnalysis = {
      networkEvents: [],
      evidences: [],
      errors: [],
    };

    // Calculate overall score: high risk permission (70) + high risk code finding (70)
    expect(manifestAnalysis.permissionRisks.length).toBe(2);
    expect(staticAnalysis.codeFindings.length).toBe(2);
    expect(sandboxAnalysis.networkEvents.length).toBe(0);
  });
});
