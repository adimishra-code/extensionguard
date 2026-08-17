import { describe, it, expect } from 'vitest';
import { analyzeStatic } from '../services/static-analyzer';
import { resolve } from 'path';

describe('Static Analyzer Integration', () => {
  it('analyzes fixture directory and discovers dangerous APIs, eval, and suspicious domains', async () => {
    const fixturePath = resolve(__dirname, '../../../tests/fixtures/sample-extension');
    const result = await analyzeStatic('scan-fixture-test', fixturePath);

    expect(result.errors).toHaveLength(0);
    expect(result.codeFindings.length).toBeGreaterThanOrEqual(4);

    // Verify chrome.cookies detected
    const cookiesFinding = result.codeFindings.find(f => f.api === 'chrome.cookies');
    expect(cookiesFinding).toBeDefined();
    expect(cookiesFinding?.severity).toBe('high');
    expect(cookiesFinding?.file_path).toBe('background.js');

    // Verify eval detected
    const evalFinding = result.codeFindings.find(f => f.api === 'eval');
    expect(evalFinding).toBeDefined();
    expect(evalFinding?.category).toBe('remote_code_execution');

    // Verify document.cookie detected in content.js
    const docCookieFinding = result.codeFindings.find(f => f.api === 'document.cookie');
    expect(docCookieFinding).toBeDefined();
    expect(docCookieFinding?.file_path).toBe('content.js');

    // Verify suspicious domain detected
    const urlFinding = result.codeFindings.find(f => f.api.includes('telemetry-analytics.xyz'));
    expect(urlFinding).toBeDefined();
    expect(urlFinding?.category).toBe('network_exfiltration');
  });
});
