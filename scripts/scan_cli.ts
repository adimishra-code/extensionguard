import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { analyzeStatic } from '../backend/src/services/static-analyzer';
import { analyzeManifest } from '../backend/src/services/manifest-analyzer';
import { llmAnalyzer } from '../backend/src/services/llm-analyzer';
import { logger } from '../backend/src/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { ExtensionManifest, LLMAnalysisInput } from '@extension-guard/shared';

function printHelp() {
  console.log(`
ExtensionGuard CLI Security Scanner
====================================
Usage:
  npx tsx scripts/scan_cli.ts [extension-path] [options]

Options:
  --deep, --llm         Run LLM purpose mismatch & behavioral analysis
  --json                Output scan results as raw JSON for CI/CD pipelines
  --fail-on-risk        Exit with non-zero exit code (1) if critical/high threats detected
  -h, --help            Show this help documentation

Examples:
  npx tsx scripts/scan_cli.ts ./tests/fixtures/sample-extension
  npx tsx scripts/scan_cli.ts ./tests/fixtures/sample-extension --deep
  npx tsx scripts/scan_cli.ts ./tests/fixtures/sample-extension --json --fail-on-risk
`);
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const isDeep = rawArgs.includes('--deep') || rawArgs.includes('--llm');
  const isJson = rawArgs.includes('--json');
  const failOnRisk = rawArgs.includes('--fail-on-risk');

  if (isJson) {
    logger.level = 'silent';
  }

  // Filter out flag arguments to get target path
  const pathArg = rawArgs.find(arg => !arg.startsWith('-'));
  const targetPath = pathArg ? resolve(process.cwd(), pathArg) : resolve(__dirname, '../tests/fixtures/sample-extension');

  if (!existsSync(targetPath)) {
    if (isJson) {
      console.log(JSON.stringify({ error: `Path "${targetPath}" does not exist.` }, null, 2));
    } else {
      console.error(`Error: Path "${targetPath}" does not exist.`);
    }
    process.exit(1);
  }

  const scanId = `cli-${uuidv4().slice(0, 8)}`;
  const startTime = Date.now();

  if (!isJson) {
    console.log(`\n======================================================`);
    console.log(`  🛡️  ExtensionGuard CLI Scanner`);
    console.log(`  Target:    ${targetPath}`);
    console.log(`  Scan ID:   ${scanId}`);
    console.log(`  Mode:      ${isDeep ? 'Deep Analysis (AST + LLM Reasoning)' : 'Standard AST Scan'}`);
    console.log(`======================================================\n`);
  }

  // 1. Analyze manifest if present
  let manifest: ExtensionManifest | undefined;
  let manifestRisks: any[] = [];
  const manifestPath = join(targetPath, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const rawManifest = readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(rawManifest) as ExtensionManifest;
      const manifestResult = await analyzeManifest(manifest, scanId);
      manifestRisks = manifestResult.permissionRisks;
    } catch (e: any) {
      if (!isJson) console.warn(`[Warning] Failed to parse manifest.json: ${e.message}`);
    }
  }

  // 2. Run static code AST analysis
  if (!isJson) console.log('🔍 Running AST security pattern analysis...');
  const staticResult = await analyzeStatic(scanId, targetPath);

  // 3. Optional: Run LLM behavioral & purpose mismatch reasoning
  let llmResult: any = null;
  if (isDeep) {
    if (!isJson) console.log('🤖 Running LLM Purpose Alignment & Semantic Risk Engine...');
    const llmInput: LLMAnalysisInput = {
      extension: {
        id: scanId,
        name: manifest?.name || 'Local Extension',
        version: manifest?.version || '1.0.0',
      },
      purpose: manifest?.description || 'No description declared in manifest.',
      privacy_policy_summary: 'Not declared.',
      permissions: manifestRisks,
      code_findings: staticResult.codeFindings,
      runtime_events: [],
    };
    llmResult = await llmAnalyzer.analyze(llmInput);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Count findings by severity
  const criticalCount = staticResult.codeFindings.filter(f => f.severity === 'critical').length;
  const highCount = staticResult.codeFindings.filter(f => f.severity === 'high').length;
  const mediumCount = staticResult.codeFindings.filter(f => f.severity === 'medium').length;
  const lowCount = staticResult.codeFindings.filter(f => f.severity === 'low').length;

  const hasHighOrCritical = criticalCount > 0 || highCount > 0 || (llmResult && llmResult.purposeMismatchScore > 50);

  if (isJson) {
    const output = {
      scanId,
      targetPath,
      durationSeconds: parseFloat(duration),
      manifest: manifest
        ? {
            name: manifest.name,
            version: manifest.version,
            manifestVersion: manifest.manifest_version,
            permissions: manifest.permissions || [],
            hostPermissions: manifest.host_permissions || [],
          }
        : null,
      summary: {
        totalFindings: staticResult.codeFindings.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
        purposeMismatchScore: llmResult ? llmResult.purposeMismatchScore : null,
      },
      permissionRisks: manifestRisks,
      codeFindings: staticResult.codeFindings,
      dataFlows: staticResult.dataFlows,
      llmAnalysis: llmResult
        ? {
            provider: llmResult.provider,
            model: llmResult.model,
            purposeMismatchScore: llmResult.purposeMismatchScore,
            summary: llmResult.output.summary,
            riskAssessment: llmResult.output.risk_assessment,
            keyFindings: llmResult.output.key_findings,
            behavioralMismatch: llmResult.output.behavioral_mismatch,
            recommendations: llmResult.output.recommended_actions,
          }
        : null,
      errors: staticResult.errors,
      status: hasHighOrCritical ? 'failed' : 'passed',
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`\nScan completed in ${duration}s.`);
    console.log(`------------------------------------------------------`);
    if (manifest) {
      console.log(`📦 Extension:    ${manifest.name} (v${manifest.version}) [MV${manifest.manifest_version}]`);
      console.log(`🔑 Permissions:  ${(manifest.permissions || []).join(', ') || 'none'}`);
    }

    console.log(`\n📊 Findings Summary:`);
    console.log(`   🔴 Critical: ${criticalCount}`);
    console.log(`   🟠 High:     ${highCount}`);
    console.log(`   🟡 Medium:   ${mediumCount}`);
    console.log(`   🟢 Low:      ${lowCount}`);

    if (llmResult) {
      console.log(`\n🧠 AI Semantic Assessment (${llmResult.provider} - ${llmResult.model}):`);
      console.log(`   Purpose Mismatch Score: ${llmResult.purposeMismatchScore}/100`);
      console.log(`   Assessed Severity:      ${llmResult.output.risk_assessment.severity.toUpperCase()}`);
      console.log(`   Assessment:             ${llmResult.output.summary}`);

      if (llmResult.output.behavioral_mismatch.length > 0) {
        console.log(`\n   ⚠️  Behavioral Mismatches:`);
        for (const mismatch of llmResult.output.behavioral_mismatch) {
          console.log(`      - ${mismatch.description}`);
        }
      }

      if (llmResult.output.recommended_actions.length > 0) {
        console.log(`\n   💡 Recommended Actions:`);
        for (const rec of llmResult.output.recommended_actions) {
          console.log(`      - ${rec}`);
        }
      }
    }

    if (staticResult.dataFlows && staticResult.dataFlows.length > 0) {
      console.log(`\n🌊 Detected Data Flows (${staticResult.dataFlows.length}):`);
      console.log('------------------------------------------------------');
      for (const df of staticResult.dataFlows) {
        console.log(`[SOURCE] ${df.source.operation} (${df.source.file}:${df.source.line}) variable: "${df.source.variable}"`);
        console.log(`  └─► [SINK]   ${df.sink.operation} (${df.sink.file}:${df.sink.line})`);
        console.log(`      Context: ${df.sink.value_preview}`);
        console.log('');
      }
    }

    console.log(`\n📋 Code Findings Details (${staticResult.codeFindings.length}):`);
    console.log('------------------------------------------------------');
    for (const finding of staticResult.codeFindings) {
      const severityTag = finding.severity.toUpperCase().padEnd(8);
      console.log(`[${severityTag}] ${finding.api.padEnd(25)} ${finding.file_path}:${finding.line}`);
      console.log(`           Category: ${finding.category}`);
      if (finding.context) {
        console.log(`           Context:  ${finding.context}`);
      }
      console.log('');
    }
  }

  if (failOnRisk && hasHighOrCritical) {
    if (!isJson) {
      console.error(`🚨 Security quality gate failed: High/Critical risks detected.`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('CLI scan failed:', err);
  process.exit(1);
});
