import { prisma } from '../utils/prisma';
import { analyzeManifest, ManifestAnalysisResult } from './manifest-analyzer';
import { analyzeStatic, StaticAnalysisResult } from './static-analyzer';
import { analyzeSandbox, SandboxAnalysisResult } from './sandbox-analyzer';
import { Scan, ScanStatus, Finding, Evidence, NetworkEvent, CodeFinding, DataFlowPath, RiskScores, PermissionRisk, Severity, FindingCategory, Confidence } from '@extension-guard/shared';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { ScanJobData } from '../queue';
import { config } from '../config';

interface ScanOrchestrationResult {
  scan: Scan;
  manifestAnalysis?: ManifestAnalysisResult;
  staticAnalysis?: StaticAnalysisResult;
  sandboxAnalysis?: SandboxAnalysisResult;
  findings: Finding[];
  allEvidence: Evidence[];
  networkEvents: NetworkEvent[];
  codeFindings: CodeFinding[];
  dataFlows: DataFlowPath[];
  riskScores: RiskScores;
  permissionRisks: PermissionRisk[];
}

function calculateRiskScores(
    manifestAnalysis: ManifestAnalysisResult,
    staticAnalysis: StaticAnalysisResult,
    sandboxAnalysis: SandboxAnalysisResult
  ): RiskScores {
    let permissionScore = 0;
    let codeScore = 0;
    let dataAccessScore = 0;
    let exfiltrationScore = 0;
    let networkScore = 0;
    let obfuscationScore = 0;
    let runtimeScore = 0;

    for (const pr of manifestAnalysis.permissionRisks) {
      const weight = pr.risk_level === 'critical' ? 10 : pr.risk_level === 'high' ? 7 : pr.risk_level === 'medium' ? 4 : 1;
      permissionScore += weight;
    }

    for (const cf of staticAnalysis.codeFindings) {
      const weight = cf.severity === 'critical' ? 10 : cf.severity === 'high' ? 7 : cf.severity === 'medium' ? 4 : 1;
      switch (cf.category) {
        case 'dangerous_api':
          codeScore += weight;
          break;
        case 'data_access':
          dataAccessScore += weight;
          break;
        case 'network_exfiltration':
          exfiltrationScore += weight;
          networkScore += weight;
          break;
        case 'remote_code_execution':
          codeScore += weight * 1.5;
          break;
        case 'obfuscation':
          obfuscationScore += weight;
          break;
      }
    }

    // Calculate runtime score based on sandbox analysis
    for (const event of sandboxAnalysis.networkEvents) {
      const weight = event.risk_level === 'critical' ? 10 : event.risk_level === 'high' ? 7 : event.risk_level === 'medium' ? 4 : 1;
      runtimeScore += weight;
    }
    
    // Also consider evidence from sandbox
    for (const evidence of sandboxAnalysis.evidences) {
      // Weight evidence by confidence
      let confidenceWeight = 1;
      switch (evidence.confidence) {
        case 'confirmed': confidenceWeight = 3; break;
        case 'likely': confidenceWeight = 2; break;
        case 'potential': confidenceWeight = 1; break;
        default: confidenceWeight = 0.5;
      }
      runtimeScore += confidenceWeight * 2; // Evidence contributes to runtime score
    }

    permissionScore = Math.min(100, permissionScore * 2);
    codeScore = Math.min(100, codeScore * 1.5);
    dataAccessScore = Math.min(100, dataAccessScore * 2);
    exfiltrationScore = Math.min(100, exfiltrationScore * 2);
    networkScore = Math.min(100, networkScore * 1.5);
    obfuscationScore = Math.min(100, obfuscationScore * 3);
    runtimeScore = Math.min(100, runtimeScore); // Cap runtime score at 100

    const overall = Math.round(
      permissionScore * 0.10 +
      codeScore * 0.20 +
      dataAccessScore * 0.10 +
      exfiltrationScore * 0.15 +
      networkScore * 0.10 +
      obfuscationScore * 0.05 +
      runtimeScore * 0.30
    );

    return {
      scan_id: '',
      overall_score: overall,
      permission_score: Math.round(permissionScore),
      code_score: Math.round(codeScore),
      data_access_score: Math.round(dataAccessScore),
      exfiltration_score: Math.round(exfiltrationScore),
      network_score: Math.round(networkScore),
      obfuscation_score: Math.round(obfuscationScore),
      dependency_score: 0,
      purpose_mismatch_score: 0,
      runtime_score: Math.round(runtimeScore),
      confidence: 0.8,
      breakdown: [
        { category: 'permission_risk', score: Math.round(permissionScore), finding_count: manifestAnalysis.permissionRisks.length, max_severity: getMaxSeverity(manifestAnalysis.permissionRisks.map(p => p.risk_level)) },
        { category: 'dangerous_api', score: Math.round(codeScore), finding_count: staticAnalysis.codeFindings.filter(c => c.category === 'dangerous_api').length, max_severity: getMaxSeverity(staticAnalysis.codeFindings.filter(c => c.category === 'dangerous_api').map(c => c.severity)) },
        { category: 'data_access', score: Math.round(dataAccessScore), finding_count: staticAnalysis.codeFindings.filter(c => c.category === 'data_access').length, max_severity: getMaxSeverity(staticAnalysis.codeFindings.filter(c => c.category === 'data_access').map(c => c.severity)) },
        { category: 'network_exfiltration', score: Math.round(exfiltrationScore), finding_count: staticAnalysis.codeFindings.filter(c => c.category === 'network_exfiltration').length, max_severity: getMaxSeverity(staticAnalysis.codeFindings.filter(c => c.category === 'network_exfiltration').map(c => c.severity)) },
        { category: 'obfuscation', score: Math.round(obfuscationScore), finding_count: staticAnalysis.codeFindings.filter(c => c.category === 'obfuscation').length, max_severity: getMaxSeverity(staticAnalysis.codeFindings.filter(c => c.category === 'obfuscation').map(c => c.severity)) },
        { category: 'runtime_behavior', score: Math.round(runtimeScore), finding_count: sandboxAnalysis.networkEvents.length + sandboxAnalysis.evidences.length, max_severity: getMaxSeverity([...sandboxAnalysis.networkEvents.map(e => e.risk_level as Severity), ...sandboxAnalysis.evidences.map(e => 
          e.confidence === 'confirmed' ? 'high' as Severity :
          e.confidence === 'likely' ? 'medium' as Severity :
          e.confidence === 'potential' ? 'low' as Severity :
          'info' as Severity)].filter((v): v is Severity => ['info', 'low', 'medium', 'high', 'critical'].includes(v))) }
      ],
    };
  }

function getMaxSeverity(severities: string[]): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  const order = ['info', 'low', 'medium', 'high', 'critical'];
  let max = 'info';
  for (const s of severities) {
    if (order.indexOf(s) > order.indexOf(max)) max = s as any;
  }
  return max;
}

function mapCategory(cat: string): FindingCategory {
  const map: Record<string, FindingCategory> = {
    'DANGEROUS_API': 'dangerous_api',
    'DATA_ACCESS': 'data_access',
    'NETWORK_EXFILTRATION': 'network_exfiltration',
    'REMOTE_CODE_EXECUTION': 'remote_code_execution',
    'OBFUSCATION': 'obfuscation',
  };
  return map[cat] || 'permission_risk';
}

function mapConfidence(conf: string): Confidence {
  const valid: Confidence[] = ['confirmed', 'likely', 'potential', 'unknown', 'not_observed', 'analysis_incomplete'];
  return valid.includes(conf as Confidence) ? conf as Confidence : 'potential';
}

async function persistResults(
    scanId: string,
    extensionId: string,
    manifestAnalysis: ManifestAnalysisResult,
    staticAnalysis: StaticAnalysisResult,
    sandboxAnalysis: SandboxAnalysisResult,
    riskScores: RiskScores,
    findings: Finding[],
    allEvidence: Evidence[],
    networkEvents: NetworkEvent[],
    codeFindings: CodeFinding[],
    dataFlows: DataFlowPath[],
    permissionRisks: PermissionRisk[]
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.scan.update({
        where: { id: scanId },
        data: { status: 'completed', completed_at: new Date() },
      });

      await tx.finding.createMany({ data: findings });
      await tx.evidence.createMany({ data: allEvidence });
      await tx.networkEvent.createMany({ data: networkEvents });
      await tx.codeFinding.createMany({ data: codeFindings });
      await tx.dataFlowPath.createMany({ data: dataFlows });
      await tx.permissionRisk.createMany({ data: permissionRisks });

      await tx.riskScores.create({
        data: {
          scan_id: scanId,
          overall_score: riskScores.overall_score,
          permission_score: riskScores.permission_score,
          code_score: riskScores.code_score,
          data_access_score: riskScores.data_access_score,
          exfiltration_score: riskScores.exfiltration_score,
          network_score: riskScores.network_score,
          obfuscation_score: riskScores.obfuscation_score,
          dependency_score: riskScores.dependency_score,
          purpose_mismatch_score: riskScores.purpose_mismatch_score,
          runtime_score: riskScores.runtime_score,
          confidence: riskScores.confidence,
          breakdown_json: riskScores.breakdown,
        },
      });
    });
  }

export async function processScanJob(jobData: ScanJobData): Promise<void> {
  const { scanId, extensionId, filePath, scanType, config: scanConfig } = jobData;
  const logger_ = logger.child({ scanId, extensionId, scanType });

  logger_.info('Starting scan job');

  await prisma.scan.update({
    where: { id: scanId },
    data: { status: 'running' },
  });

  try {
    let manifestAnalysis: ManifestAnalysisResult = { permissionRisks: [], evidences: [], manifestHash: '', errors: [] };
    let staticAnalysis: StaticAnalysisResult = { codeFindings: [], dataFlows: [], evidences: [], errors: [] };
    let sandboxAnalysis: SandboxAnalysisResult = { networkEvents: [], evidences: [], errors: [] };

    if (scanType !== 'sandbox') {
      const extension = await prisma.extension.findUnique({ where: { id: extensionId } });
      if (extension?.manifest_json) {
        manifestAnalysis = await analyzeManifest(extension.manifest_json as any, scanId);
      }
    }

    if (scanConfig.enableStatic) {
      staticAnalysis = await analyzeStatic(scanId, filePath, {
        enableDataFlow: scanConfig.enableDataFlow,
        maxFileSizeMb: scanConfig.maxFileSizeMb,
      });
    }

    if (scanConfig.enableRuntime) {
      sandboxAnalysis = await analyzeSandbox(scanId, filePath, {
        timeoutSeconds: scanConfig.runtimeTimeoutSeconds
      });
    }

    const allEvidence: Evidence[] = [
      ...manifestAnalysis.evidences,
      ...staticAnalysis.evidences,
      ...sandboxAnalysis.evidences,
    ];

    const findings: Finding[] = [];

    for (const pr of manifestAnalysis.permissionRisks) {
      if (['high', 'critical'].includes(pr.risk_level)) {
        findings.push({
          id: uuidv4(),
          scan_id: scanId,
          category: 'permission_risk',
          severity: pr.risk_level,
          confidence: 'confirmed',
          title: `High-risk permission: ${pr.permission}`,
          description: pr.reason,
          technical_details: `Extension declares permission "${pr.permission}" which ${pr.reason.toLowerCase()}.`,
          recommendation: pr.used_in_code === false 
            ? 'Consider removing this permission if not needed.'
            : 'Verify this permission is necessary for extension functionality.',
          limitations: 'Permission declaration alone does not confirm malicious use. Code correlation needed.',
          evidence_ids: pr.evidence_ids,
          affected_api: pr.permission,
          created_at: new Date().toISOString(),
        });
      }
    }

    for (const cf of staticAnalysis.codeFindings) {
      findings.push({
        id: uuidv4(),
        scan_id: scanId,
        category: mapCategory(cf.category),
        severity: cf.severity,
        confidence: mapConfidence(cf.confidence),
        title: `${cf.api} usage detected`,
        description: `Found ${cf.api} in ${cf.file_path}:${cf.line}`,
        technical_details: `Code pattern "${cf.pattern}" detected at ${cf.file_path}:${cf.line}. Context: ${cf.context}`,
        recommendation: getRecommendationForCategory(cf.category),
        limitations: 'Static analysis cannot confirm runtime behavior. Dynamic analysis recommended.',
        evidence_ids: [],
        affected_file: cf.file_path,
        affected_line: cf.line,
        affected_api: cf.api,
        code_snippet: cf.context,
        created_at: new Date().toISOString(),
      });
    }

    const networkEvents: NetworkEvent[] = [
      ...staticAnalysis.codeFindings.map(cf => ({
        // Convert code findings to network events if they represent network activity
        ...(cf.category === 'NETWORK_EXFILTRATION' ? {
          id: uuidv4(),
          scan_id: scanId,
          url: cf.api.startsWith('http') ? cf.api : `unknown://${cf.api}`,
          domain: cf.api.startsWith('http') ? new URL(cf.api).hostname : 'unknown',
          method: 'UNKNOWN',
          request_headers: {},
          response_headers: {},
          request_size: 0,
          response_size: 0,
          timestamp: new Date().toISOString(),
          initiator: '',
          stack_trace: '',
          is_third_party: true,
          risk_level: cf.severity,
          classification: 'unknown'
        } : null)
      })).filter((ev): ev is NetworkEvent => ev !== null),
      ...sandboxAnalysis.networkEvents
    ];
    const codeFindings: CodeFinding[] = staticAnalysis.codeFindings.map(cf => ({
      id: uuidv4(),
      scan_id: scanId,
      file_path: cf.file_path,
      line: cf.line,
      column: cf.column,
      api: cf.api,
      pattern: cf.pattern,
      category: cf.category,
      severity: cf.severity,
      confidence: mapConfidence(cf.confidence),
      context: cf.context,
      ast_node_type: cf.ast_node_type,
    }));
    const dataFlows: DataFlowPath[] = staticAnalysis.dataFlows.map(df => ({
      id: uuidv4(),
      scan_id: scanId,
      source_json: df.source,
      transformations_json: df.transformations,
      sink_json: df.sink,
      confidence: df.confidence,
    }));

    const permissionRisks: PermissionRisk[] = manifestAnalysis.permissionRisks.map(pr => ({
      id: uuidv4(),
      scan_id: scanId,
      permission: pr.permission,
      risk_level: pr.risk_level,
      reason: pr.reason,
      used_in_code: pr.used_in_code,
      evidence_ids: pr.evidence_ids,
    }));

    const riskScores = calculateRiskScores(manifestAnalysis, staticAnalysis, sandboxAnalysis);
    riskScores.scan_id = scanId;

    await persistResults(
      scanId,
      extensionId,
      manifestAnalysis,
      staticAnalysis,
      sandboxAnalysis,
      riskScores,
      findings,
      allEvidence,
      networkEvents,
      codeFindings,
      dataFlows,
      permissionRisks
    );

    logger_.info({ findingsCount: findings.length }, 'Scan job completed successfully');
  } catch (error) {
    logger_.error({ error }, 'Scan job failed');
    await prisma.scan.update({
      where: { id: scanId },
      data: { 
        status: 'failed', 
        completed_at: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}

function getRecommendationForCategory(category: string): string {
  const recs: Record<string, string> = {
    DANGEROUS_API: 'Review whether this API is necessary. Consider using alternative APIs with narrower scope.',
    DATA_ACCESS: 'Ensure data access is minimal and user consent is obtained. Avoid collecting sensitive data unnecessarily.',
    NETWORK_EXFILTRATION: 'Verify all network destinations are legitimate and disclosed. Implement data minimization.',
    REMOTE_CODE_EXECUTION: 'Avoid dynamic code execution. Use static code where possible. If required, implement strict CSP.',
    OBFUSCATION: 'Obfuscation may hide malicious behavior. Ensure code is reviewable and source maps are available.',
  };
  return recs[category] || 'Review this finding manually.';
}