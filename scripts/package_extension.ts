import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

async function packageExtension() {
  const distDir = path.resolve(__dirname, '../monitor-extension/dist');
  const outDir = path.resolve(__dirname, '../packages');
  const zipPath = path.join(outDir, 'extensionguard-monitor-v2.0.0.zip');

  if (!fs.existsSync(distDir)) {
    console.error(`Dist directory does not exist at ${distDir}. Run build first.`);
    process.exit(1);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log(`Packaging extension from ${distDir}...`);
  const zip = new AdmZip();
  zip.addLocalFolder(distDir, '');
  zip.writeZip(zipPath);

  const stats = fs.statSync(zipPath);
  console.log(`Successfully created Chrome Web Store package:`);
  console.log(`  Path: ${zipPath}`);
  console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`Ready for direct upload to Chrome Web Store Developer Dashboard!`);
}

packageExtension().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});

