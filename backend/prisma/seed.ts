import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo extension audit data...');

  // Clean existing seed data
  await prisma.finding.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.networkEvent.deleteMany();
  await prisma.codeFinding.deleteMany();
  await prisma.dataFlowPath.deleteMany();
  await prisma.permissionRisk.deleteMany();
  await prisma.riskScores.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.extension.deleteMany();

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

  console.log(`✓ Created ${2} extensions, ${2} scans`);
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
