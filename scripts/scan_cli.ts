import { resolve } from 'path';
import { existsSync } from 'fs';
import { analyzeStatic } from '../backend/src/services/static-analyzer';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const args = process.argv.slice(2);
  const targetPath = args[0] || resolve(__dirname, '../tests/fixtures/sample-extension');

  if (!existsSync(targetPath)) {
    console.error(`Error: Path "${targetPath}" does not exist.`);
    process.exit(1);
  }

  const scanId = `cli-${uuidv4().slice(0, 8)}`;
  console.log(`\n======================================================`);
  console.log(`  ExtensionGuard CLI Scanner`);
  console.log(`  Target: ${targetPath}`);
  console.log(`  Scan ID: ${scanId}`);
  console.log(`======================================================\n`);

  console.log('Running static AST security analysis...');
  const start = Date.now();
  const result = await analyzeStatic(scanId, targetPath);
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\nAnalysis completed in ${duration}s.\n`);

  if (result.errors.length > 0) {
    console.error('Errors encountered:', result.errors);
  }

  console.log(`Discovered ${result.codeFindings.length} code findings:`);
  console.log('------------------------------------------------------');

  for (const finding of result.codeFindings) {
    const severityTag = finding.severity.toUpperCase().padEnd(8);
    console.log(`[${severityTag}] ${finding.api.padEnd(25)} ${finding.file_path}:${finding.line}`);
    console.log(`           Category: ${finding.category}`);
    if (finding.context) {
      console.log(`           Context:  ${finding.context}`);
    }
    console.log('');
  }

  console.log(`Total Evidence Items: ${result.evidences.length}`);
}

main().catch((err) => {
  console.error('CLI scan failed:', err);
  process.exit(1);
});
