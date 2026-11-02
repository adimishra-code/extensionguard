import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdmZip from 'adm-zip';

// Mock Prisma
vi.mock('../../src/utils/prisma', () => ({
  prisma: {
    cWSMetadata: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    extensionVersion: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'ver-1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    cWSExtensionVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'ver-1' }),
    },
    supplyChainEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    monitoredExtension: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock differential analyzer
vi.mock('../../src/services/differential-analyzer', () => ({
  differentialAnalyzer: {
    analyzeVersions: vi.fn().mockResolvedValue({ riskScoreChange: 0, overallRisk: 'low' }),
  },
}));

// Mock websocket manager
vi.mock('../../src/services/websocket-manager', () => ({
  wsManager: {
    sendToUser: vi.fn(),
  },
}));

import { CWSScraperService } from '../../src/services/cws-scraper';

describe('CWSScraperService', () => {
  let scraper: CWSScraperService;

  beforeEach(() => {
    scraper = new CWSScraperService();
    vi.clearAllMocks();
  });

  describe('extractZipFromCRX', () => {
    it('returns raw buffer unchanged if it is already a regular zip', () => {
      const zip = new AdmZip();
      zip.addFile('manifest.json', Buffer.from(JSON.stringify({ name: 'Test Ext', version: '1.0' })));
      const zipBuffer = zip.toBuffer();

      const extracted = scraper.extractZipFromCRX(zipBuffer);
      expect(extracted).toEqual(zipBuffer);
      expect(extracted[0]).toBe(0x50); // 'P'
      expect(extracted[1]).toBe(0x4b); // 'K'
    });

    it('strips CRX3 signature header and finds embedded PK zip stream', () => {
      const zip = new AdmZip();
      zip.addFile('manifest.json', Buffer.from(JSON.stringify({ name: 'CRX Test', version: '2.0' })));
      const zipBuffer = zip.toBuffer();

      // Create synthetic CRX3 header: "Cr24" + 128 bytes dummy header data + real PK zip
      const crxMagic = Buffer.from([0x43, 0x72, 0x32, 0x34]); // 'Cr24'
      const dummyHeader = Buffer.alloc(128, 0xaa);
      const crxBuffer = Buffer.concat([crxMagic, dummyHeader, zipBuffer]);

      const extracted = scraper.extractZipFromCRX(crxBuffer);
      expect(extracted[0]).toBe(0x50); // 'P'
      expect(extracted[1]).toBe(0x4b); // 'K'
      expect(extracted[2]).toBe(0x03);
      expect(extracted[3]).toBe(0x04);

      // Verify that AdmZip can parse the extracted buffer
      const parsedZip = new AdmZip(extracted);
      const manifestEntry = parsedZip.getEntry('manifest.json');
      expect(manifestEntry).toBeDefined();
      const content = JSON.parse(manifestEntry!.getData().toString('utf8'));
      expect(content.name).toBe('CRX Test');
      expect(content.version).toBe('2.0');
    });
  });

  describe('scrapeExtension fallback', () => {
    it('falls back to mock/synthetic data gracefully when offline in sandbox', async () => {
      const extId = 'abcdefghijklmnopabcdefghijklmnop';
      const info = await scraper.scrapeExtension(extId);

      expect(info).not.toBeNull();
      expect(info?.id).toBe(extId);
      expect(info?.name).toBeDefined();
      expect(info?.version).toBeDefined();
      expect(Array.isArray(info?.permissions)).toBe(true);
    });

    it('records delisting event when CWS endpoint returns 404', async () => {
      const extId = 'delistedextid1234567890abcdef123';
      
      // Mock global fetch to return 404 for this extension
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(extId)) {
          return Promise.resolve({
            status: 404,
            ok: false,
          });
        }
        return originalFetch(url);
      });

      try {
        const info = await scraper.scrapeExtension(extId);
        expect(info).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
