import { CodeFinding, Evidence, FindingCategory, Severity, Confidence, DataFlowPath, DataFlowNode } from '@extension-guard/shared';
import { logger } from '../utils/logger';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface StaticAnalysisResult {
  codeFindings: CodeFinding[];
  dataFlows: DataFlowPath[];
  evidences: Evidence[];
  errors: string[];
}

export async function analyzeStatic(
  scanId: string,
  extensionPath: string,
  options: {
    enableDataFlow?: boolean;
    maxFileSizeMb?: number;
  } = {}
): Promise<StaticAnalysisResult> {
  const logger_ = logger.child({ scanId, service: 'static-analyzer' });
  const codeFindings: CodeFinding[] = [];
  const dataFlows: DataFlowPath[] = [];
  const evidences: Evidence[] = [];
  const errors: string[] = [];

  const tempDir = mkdtempSync(join(tmpdir(), 'extguard-static-'));
  const pythonScriptPath = join(__dirname, '..', '..', 'analyzer', 'scripts', 'static_analyzer.py');

  return new Promise<StaticAnalysisResult>((resolve, reject) => {
    const python = spawn('python3', [pythonScriptPath, scanId, extensionPath], {
      timeout: options.maxFileSizeMb ? options.maxFileSizeMb * 1000 : 300000,
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      if (code !== 0) {
        logger_.error({ stderr, code }, 'Static analysis process failed');
        errors.push(`Static analysis failed with code ${code}: ${stderr}`);
        resolve({ codeFindings: [], dataFlows: [], evidences: [], errors });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        logger_.info({ 
          findingsCount: result.codeFindings?.length || 0, 
          evidenceCount: result.evidences?.length || 0 
        }, 'Static analysis complete');
        resolve(result);
      } catch (e) {
        logger_.error({ stdout, error: e }, 'Failed to parse static analysis output');
        errors.push('Failed to parse static analysis output');
        resolve({ codeFindings: [], dataFlows: [], evidences: [], errors });
        return;
      }
    });

    python.on('error', (err) => {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {}
      logger_.error({ err }, 'Static analysis process error');
      reject(err);
    });
  });
}