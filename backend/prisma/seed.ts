import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo extension audit and threat intelligence data...');

  // Clean existing seed data in correct dependency order
  await prisma.monitoringEvent.deleteMany();
  await prisma.monitorSession.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.networkLog.deleteMany();
  await prisma.monitoredExtension.deleteMany();
  await prisma.communityReport.deleteMany();
  await prisma.threatIntelligence.deleteMany();
  await prisma.supplyChainEvent.deleteMany();
  await prisma.differentialAnalysis.deleteMany();
  await prisma.extensionVersion.deleteMany();
  await prisma.cWSMetadata.deleteMany();
  await prisma.finding.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.networkEvent.deleteMany();
  await prisma.codeFinding.deleteMany();
  await prisma.dataFlowPath.deleteMany();
  await prisma.permissionRisk.deleteMany();
  await prisma.riskScores.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.extension.deleteMany();
  await prisma.user.deleteMany();

  // ─── 0. Default Admin & Analyst User ─────────────────────────────────────────
  const passwordHash = await bcrypt.hash('admin12345', 10);
  const demoUser = await prisma.user.create({
    data: {
      email: 'security@extensionguard.io',
      password_hash: passwordHash,
      api_key: 'eg_sec_analyst_demo_live_key_99',
    },
  });

  // ─── 1. High-Risk Extension: AdBlock Ultra Speed (Malicious Injector) ────────
  const ext1 = await prisma.extension.create({
    data: {
      name: 'AdBlock Ultra Speed',
      version: '3.4.1',
      browser: 'chrome',
      source: 'upload',
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      size_bytes: 1420500,
      manifest_json: {
        manifest_version: 3,
        name: 'AdBlock Ultra Speed',
        version: '3.4.1',
        description: 'Blocks ads and trackers with maximum performance',
        permissions: ['cookies', 'webRequest', 'storage', 'tabs'],
        host_permissions: ['<all_urls>'],
        background: { service_worker: 'background.js' },
      },
    },
  });

  const scan1 = await prisma.scan.create({
    data: {
      extension_id: ext1.id,
      type: 'full',
      status: 'completed',
      started_at: new Date(Date.now() - 3600000),
      completed_at: new Date(Date.now() - 3540000),
      analyzer_version: '1.0.0',
      ruleset_version: '1.0.0',
      config_json: {
        enable_static: true,
        enable_runtime: true,
        enable_network: true,
        enable_data_flow: true,
        enable_llm: false,
        runtime_timeout_seconds: 120,
        max_file_size_mb: 50,
        rulesets: ['owasp_top10', 'malware_signatures'],
      },
    },
  });

  await prisma.riskScores.create({
    data: {
      scan_id: scan1.id,
      overall_score: 82,
      permission_score: 90,
      code_score: 75,
      data_access_score: 85,
      exfiltration_score: 80,
      network_score: 70,
      obfuscation_score: 60,
      dependency_score: 20,
      purpose_mismatch_score: 50,
      runtime_score: 85,
      confidence: 0.92,
      breakdown_json: {
        permission: 90,
        code: 75,
        data_access: 85,
        exfiltration: 80,
        obfuscation: 60,
        runtime: 85,
      },
    },
  });

  await prisma.finding.createMany({
    data: [
      {
        scan_id: scan1.id,
        category: 'permission_risk',
        severity: 'critical',
        confidence: 'confirmed',
        title: 'High-risk permission: host:<all_urls>',
        description: 'Host permission grants access to all websites without domain boundaries',
        technical_details: 'Extension declares wildcard <all_urls> host scope.',
        recommendation: 'Scope host permissions to specific domains required for operation.',
        limitations: 'Static manifest declaration.',
        evidence_ids: [],
      },
      {
        scan_id: scan1.id,
        category: 'remote_code_execution',
        severity: 'high',
        confidence: 'likely',
        title: 'eval() usage detected in background worker',
        description: 'Found eval in background.js:42',
        technical_details: 'Code pattern "eval(x)" detected in background script.',
        recommendation: 'Eliminate dynamic string evaluation and use structured JSON parsing.',
        limitations: 'Static AST detection.',
        affected_file: 'background.js',
        affected_line: 42,
        affected_api: 'eval',
        code_snippet: 'eval(responseBody);',
        evidence_ids: [],
      },
      {
        scan_id: scan1.id,
        category: 'network_exfiltration',
        severity: 'high',
        confidence: 'confirmed',
        title: 'Outbound third-party request to tracking-cdn.xyz',
        description: 'Extension initiated network request to https://tracking-cdn.xyz/collect',
        technical_details: 'Dynamic request POST to https://tracking-cdn.xyz/collect.',
        recommendation: 'Verify if this endpoint is authorized and complies with privacy policy.',
        limitations: 'Dynamic network capture.',
        affected_api: 'tracking-cdn.xyz',
        evidence_ids: [],
      },
    ],
  });

  await prisma.permissionRisk.createMany({
    data: [
      {
        scan_id: scan1.id,
        permission: 'cookies',
        risk_level: 'high',
        reason: 'Can read and modify cookies across domains',
        evidence_ids: [],
      },
      {
        scan_id: scan1.id,
        permission: 'host:<all_urls>',
        risk_level: 'critical',
        reason: 'Host permission grants access to all sites',
        evidence_ids: [],
      },
    ],
  });

  // ─── 2. Low-Risk Extension: Eyedropper Color Picker ──────────────────────────
  const ext2 = await prisma.extension.create({
    data: {
      name: 'Eyedropper Color Picker',
      version: '1.2.0',
      browser: 'chrome',
      source: 'upload',
      hash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      size_bytes: 320400,
      manifest_json: {
        manifest_version: 3,
        name: 'Eyedropper Color Picker',
        version: '1.2.0',
        description: 'Simple and private eyedropper color picker',
        permissions: ['storage', 'activeTab'],
        background: { service_worker: 'bg.js' },
      },
    },
  });

  const scan2 = await prisma.scan.create({
    data: {
      extension_id: ext2.id,
      type: 'quick',
      status: 'completed',
      started_at: new Date(Date.now() - 7200000),
      completed_at: new Date(Date.now() - 7170000),
      analyzer_version: '1.0.0',
      ruleset_version: '1.0.0',
      config_json: {
        enable_static: true,
        enable_runtime: false,
        enable_network: false,
        enable_data_flow: false,
        enable_llm: false,
        runtime_timeout_seconds: 60,
        max_file_size_mb: 50,
        rulesets: ['owasp_top10'],
      },
    },
  });

  await prisma.riskScores.create({
    data: {
      scan_id: scan2.id,
      overall_score: 12,
      permission_score: 15,
      code_score: 10,
      data_access_score: 10,
      exfiltration_score: 0,
      network_score: 0,
      obfuscation_score: 0,
      dependency_score: 0,
      purpose_mismatch_score: 0,
      runtime_score: 0,
      confidence: 0.95,
      breakdown_json: {
        permission: 15,
        code: 10,
        data_access: 10,
        exfiltration: 0,
        obfuscation: 0,
      },
    },
  });

  // ─── 3. Threat Intelligence Database Seeds ──────────────────────────────────
  await prisma.threatIntelligence.createMany({
    data: [
      {
        domain: 'tracking-cdn.xyz',
        type: 'domain',
        severity: 'critical',
        description: 'Known C2 telemetry endpoint harvesting form inputs and auth tokens',
        source: 'verified',
        confidence: 0.98,
        active: true,
        metadata: { category: 'credential_harvesting', first_seen: '2026-08-10' },
      },
      {
        domain: 'analytics-telemetry-sync.online',
        type: 'domain',
        severity: 'high',
        description: 'Suspicious dynamic script loader targeting banking URLs',
        source: 'vendor',
        confidence: 0.92,
        active: true,
        metadata: { category: 'malicious_redirect', first_seen: '2026-09-02' },
      },
      {
        pattern: 'eval\\(atob\\([a-zA-Z0-9_]+\\)\\)',
        type: 'code_pattern',
        severity: 'critical',
        description: 'Obfuscated base64 payload evaluation detected in content scripts',
        source: 'automated',
        confidence: 0.95,
        active: true,
        metadata: { rule: 'ast_eval_base64' },
      },
      {
        extension_id: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        type: 'extension',
        severity: 'critical',
        description: 'AdBlock Ultra Speed v3.4.1 caught exfiltrating session tokens',
        source: 'community',
        confidence: 0.94,
        active: true,
        metadata: { flagged_by_reports: 14 },
      },
    ],
  });

  // ─── 4. Community Reports ────────────────────────────────────────────────────
  await prisma.communityReport.createMany({
    data: [
      {
        user_id: demoUser.id,
        extension_id: 'adblock-ultra-fake-id',
        extension_name: 'AdBlock Ultra Speed',
        extension_version: '3.4.1',
        report_type: 'data_theft',
        description: 'After update to 3.4.1, developer console shows POST requests with cookie dumps to tracking-cdn.xyz',
        status: 'verified',
        reviewed_by: 'security@extensionguard.io',
        review_notes: 'Confirmed malicious telemetry injected into service worker.',
      },
      {
        user_id: demoUser.id,
        extension_id: 'pdf-converter-quick-id',
        extension_name: 'Quick PDF Maker',
        extension_version: '2.1.0',
        report_type: 'suspicious',
        description: 'Requests clipboardRead and all_urls permissions despite only converting local PDFs.',
        status: 'pending',
      },
    ],
  });

  // ─── 5. Extension Versions & Differential Analysis ───────────────────────────
  const cwsExtId = 'adblock-ultra-demo';
  const vOld = await prisma.extensionVersion.create({
    data: {
      extension_id: cwsExtId,
      version: '3.4.0',
      name: 'AdBlock Ultra Speed',
      description: 'Fast adblocker',
      permissions: ['storage'],
      host_permissions: ['https://*/*'],
      manifest: { version: '3.4.0', permissions: ['storage'] },
      release_date: new Date(Date.now() - 86400000 * 30),
    },
  });

  const vNew = await prisma.extensionVersion.create({
    data: {
      extension_id: cwsExtId,
      version: '3.4.1',
      name: 'AdBlock Ultra Speed',
      description: 'Fast adblocker with performance enhancements',
      permissions: ['storage', 'cookies', 'webRequest', 'tabs'],
      host_permissions: ['<all_urls>'],
      manifest: { version: '3.4.1', permissions: ['storage', 'cookies', 'webRequest', 'tabs'] },
      release_date: new Date(Date.now() - 86400000 * 2),
      scan_id: scan1.id,
    },
  });

  await prisma.differentialAnalysis.create({
    data: {
      extension_id: cwsExtId,
      old_version: '3.4.0',
      new_version: '3.4.1',
      permissions_added: ['cookies', 'webRequest', 'tabs'],
      permissions_removed: [],
      host_permissions_added: ['<all_urls>'],
      host_permissions_removed: [],
      manifest_changes: {
        permissions: { added: ['cookies', 'webRequest', 'tabs'], removed: [] },
        host_permissions: { added: ['<all_urls>'], removed: [] },
      },
      code_changes_summary: 'New background telemetry sender added with eval-based loader.',
      risk_delta: 52,
      severity: 'critical',
      findings_added: 3,
      findings_removed: 0,
    },
  });

  await prisma.supplyChainEvent.createMany({
    data: [
      {
        extension_version_id: vNew.id,
        extension_id: cwsExtId,
        event_type: 'permission_added',
        severity: 'critical',
        description: 'New permissions added in v3.4.1: cookies, webRequest, tabs, host:<all_urls>',
        metadata: { permissions: ['cookies', 'webRequest', 'tabs'], host_permissions: ['<all_urls>'] },
      },
      {
        extension_version_id: vNew.id,
        extension_id: cwsExtId,
        event_type: 'ownership_transfer',
        severity: 'high',
        description: 'Maintainer contact email changed from dev@adblocker.org to lead@unknown-holding.io',
        metadata: { old_email: 'dev@adblocker.org', new_email: 'lead@unknown-holding.io' },
      },
    ],
  });

  // ─── 6. Monitored Extension & User Alerts ────────────────────────────────────
  await prisma.monitoredExtension.create({
    data: {
      user_id: demoUser.id,
      extension_id: cwsExtId,
      extension_name: 'AdBlock Ultra Speed',
      current_version: '3.4.1',
      auto_scan: true,
      alert_on_update: true,
      alert_threshold: 'high',
    },
  });

  await prisma.alert.createMany({
    data: [
      {
        user_id: demoUser.id,
        extension_id: cwsExtId,
        severity: 'critical',
        title: 'High-risk permission expansion in AdBlock Ultra Speed',
        message: 'Version 3.4.1 added wildcard host scope (<all_urls>) and cookies permission.',
        action_required: true,
        read: false,
      },
      {
        user_id: demoUser.id,
        extension_id: cwsExtId,
        severity: 'high',
        title: 'Suspicious telemetry endpoint connection',
        message: 'Observed traffic to known IOC tracking-cdn.xyz during runtime analysis.',
        action_required: false,
        read: false,
      },
      {
        user_id: demoUser.id,
        extension_id: ext2.id,
        severity: 'low',
        title: 'Routine scan completed for Eyedropper Color Picker',
        message: 'No elevated risk or suspicious network calls detected.',
        action_required: false,
        read: true,
      },
    ],
  });

  // ─── 7. Intercepted Network Logs ─────────────────────────────────────────────
  await prisma.networkLog.createMany({
    data: [
      {
        extension_id: cwsExtId,
        url: 'https://tracking-cdn.xyz/collect',
        method: 'POST',
        status_code: 200,
        blocked: true,
        request_headers: { 'content-type': 'application/json' },
      },
      {
        extension_id: cwsExtId,
        url: 'https://analytics-telemetry-sync.online/v1/ping',
        method: 'GET',
        status_code: 403,
        blocked: true,
      },
      {
        extension_id: ext2.id,
        url: 'https://fonts.googleapis.com/css2?family=Inter',
        method: 'GET',
        status_code: 200,
        blocked: false,
      },
    ],
  });

  console.log('✓ Created 1 demo user');
  console.log(`✓ Created 2 extensions, 2 scans, 4 threat IOCs`);
  console.log(`✓ Created differential analysis, supply chain events, alerts, and network logs`);
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
