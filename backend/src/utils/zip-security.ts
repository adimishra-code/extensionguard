import AdmZip from 'adm-zip';

export const MAX_ZIP_FILE_COUNT = 500;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Validates zip entries against zip-bomb and path-traversal (Zip Slip) attacks.
 */
export function validateZipSecurity(zip: AdmZip): void {
  const entries = zip.getEntries();

  if (entries.length > MAX_ZIP_FILE_COUNT) {
    throw new Error(`Archive exceeds maximum allowed file count (${MAX_ZIP_FILE_COUNT})`);
  }

  let totalSize = 0;
  for (const entry of entries) {
    const name = entry.entryName;
    if (name.includes('..') || name.startsWith('/') || name.startsWith('\\') || name.includes(':')) {
      throw new Error(`Suspicious path traversal pattern in archive entry: ${name}`);
    }
    totalSize += entry.header.size;
    if (totalSize > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error(`Archive exceeds maximum decompressed size limit (50 MB)`);
    }
  }
}
