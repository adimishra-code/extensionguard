import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Route Input Validation & File Header Signatures', () => {
  const scanTypeSchema = z.enum(['quick', 'deep', 'sandbox', 'full']).default('quick');

  const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    search: z.string().max(100).optional(),
  });

  function isValidZipOrCrx(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && 
      ((buffer[2] === 0x03 && buffer[3] === 0x04) || 
       (buffer[2] === 0x05 && buffer[3] === 0x06) || 
       (buffer[2] === 0x07 && buffer[3] === 0x08));
    const isCrx = buffer[0] === 0x43 && buffer[1] === 0x72 && buffer[2] === 0x32 && buffer[3] === 0x34;
    return isZip || isCrx;
  }

  it('validates and falls back on scanType safely', () => {
    expect(scanTypeSchema.parse('quick')).toBe('quick');
    expect(scanTypeSchema.parse('deep')).toBe('deep');
    expect(scanTypeSchema.parse('sandbox')).toBe('sandbox');
    expect(scanTypeSchema.parse('full')).toBe('full');
    expect(scanTypeSchema.safeParse('invalid_scan_type').success).toBe(false);
  });

  it('clamps and bounds pagination parameters correctly', () => {
    const defaultParams = paginationSchema.parse({});
    expect(defaultParams.limit).toBe(20);
    expect(defaultParams.offset).toBe(0);

    const customParams = paginationSchema.parse({ limit: '50', offset: '100', search: 'adblock' });
    expect(customParams.limit).toBe(50);
    expect(customParams.offset).toBe(100);
    expect(customParams.search).toBe('adblock');

    expect(paginationSchema.safeParse({ limit: '999999' }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: '-5' }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: 'invalid' }).success).toBe(false);
  });

  it('validates ZIP and CRX magic bytes headers', () => {
    // Valid ZIP header PK\x03\x04
    const validZipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(isValidZipOrCrx(validZipBuffer)).toBe(true);

    // Valid CRX header Cr24
    const validCrxBuffer = Buffer.from([0x43, 0x72, 0x32, 0x34, 0x00, 0x00]);
    expect(isValidZipOrCrx(validCrxBuffer)).toBe(true);

    // Invalid non-archive executable / text header
    const invalidTextBuffer = Buffer.from('console.log("hello");');
    expect(isValidZipOrCrx(invalidTextBuffer)).toBe(false);

    // Truncated buffer
    const truncatedBuffer = Buffer.from([0x50, 0x4b]);
    expect(isValidZipOrCrx(truncatedBuffer)).toBe(false);
  });

  function extractZipBuffer(buffer: Buffer): Buffer {
    if (buffer[0] === 0x43 && buffer[1] === 0x72 && buffer[2] === 0x32 && buffer[3] === 0x34) {
      for (let i = 4; i < Math.min(buffer.length - 4, 100000); i++) {
        if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x03 && buffer[i + 3] === 0x04) {
          return buffer.subarray(i);
        }
      }
    }
    return buffer;
  }

  it('extracts ZIP payload from CRX binary buffer accurately', () => {
    const crxHeader = Buffer.from([0x43, 0x72, 0x32, 0x34, 0x02, 0x00, 0x00, 0x00]); // Cr24 + version 2
    const zipPayload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]); // PK\x03\x04
    const combinedCrx = Buffer.concat([crxHeader, zipPayload]);

    const extracted = extractZipBuffer(combinedCrx);
    expect(extracted[0]).toBe(0x50);
    expect(extracted[1]).toBe(0x4b);
    expect(extracted[2]).toBe(0x03);
    expect(extracted[3]).toBe(0x04);
  });
});
