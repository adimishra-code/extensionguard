import { describe, it, expect, beforeEach, vi } from 'vitest';
import { networkMonitor } from '../../src/services/network-monitor';
import { prisma } from '../../src/utils/prisma';

// Mock Prisma
vi.mock('../../src/utils/prisma', () => ({
  prisma: {
    networkLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    supplyChainEvent: {
      create: vi.fn(),
    },
  },
}));

// Mock threat intelligence
vi.mock('../../src/services/threat-intelligence', () => ({
  threatIntel: {
    checkDomain: vi.fn().mockResolvedValue({ isThreat: false, threats: [] }),
  },
}));

describe('Network Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logRequest', () => {
    it('should log network request to database', async () => {
      const request = {
        extensionId: 'test-ext-1',
        url: 'https://api.example.com/data',
        method: 'GET',
        timestamp: new Date(),
      };

      await networkMonitor.logRequest(request);

      expect(vi.mocked(prisma.networkLog.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extension_id: 'test-ext-1',
            url: 'https://api.example.com/data',
            method: 'GET',
          }),
        })
      );
    });

    it('should handle malformed URLs gracefully', async () => {
      const request = {
        extensionId: 'test-ext-2',
        url: 'not-a-valid-url',
        method: 'GET',
        timestamp: new Date(),
      };

      await expect(networkMonitor.logRequest(request)).resolves.not.toThrow();
    });

    it('should check domains against threat intelligence', async () => {
      const { threatIntel } = await import('../../src/services/threat-intelligence');

      const request = {
        extensionId: 'test-ext-3',
        url: 'https://suspicious.com/track',
        method: 'POST',
        timestamp: new Date(),
      };

      await networkMonitor.logRequest(request);

      expect(threatIntel.checkDomain).toHaveBeenCalledWith('suspicious.com');
    });
  });

  describe('getExtensionActivity', () => {
    it('should retrieve network logs for extension', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          extension_id: 'test-ext',
          url: 'https://example.com',
          method: 'GET',
          timestamp: new Date(),
        },
      ];

      vi.mocked(prisma.networkLog.findMany).mockResolvedValue(mockLogs);

      const result = await networkMonitor.getExtensionActivity('test-ext');

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com');
    });

    it('should limit results', async () => {
      vi.mocked(prisma.networkLog.findMany).mockResolvedValue([]);

      await networkMonitor.getExtensionActivity('test-ext', 50);

      expect(vi.mocked(prisma.networkLog.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('getSuspiciousActivity', () => {
    it('should retrieve blocked requests', async () => {
      const mockBlocked = [
        {
          id: 'log-blocked-1',
          extension_id: 'test-ext',
          url: 'https://malicious.com',
          blocked: true,
        },
      ];

      vi.mocked(prisma.networkLog.findMany).mockResolvedValue(mockBlocked);

      const result = await networkMonitor.getSuspiciousActivity();

      expect(vi.mocked(prisma.networkLog.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { blocked: true },
        })
      );
    });
  });

  describe('getExtensionNetworkStats', () => {
    it('should calculate network statistics', async () => {
      vi.mocked(prisma.networkLog.count).mockResolvedValueOnce(100);
      vi.mocked(prisma.networkLog.groupBy).mockResolvedValueOnce([
        { url: 'https://api1.com' },
        { url: 'https://api2.com' },
      ]);
      vi.mocked(prisma.networkLog.count).mockResolvedValueOnce(5);

      const stats = await networkMonitor.getExtensionNetworkStats('test-ext');

      expect(stats.totalRequests).toBe(100);
      expect(stats.uniqueDomains).toBe(2);
      expect(stats.blockedRequests).toBe(5);
    });
  });

  describe('analyzeNetworkPatterns', () => {
    it('should detect excessive domain usage', async () => {
      const mockLogs = Array(100).fill(null).map((_, i) => ({
        id: `log-${i}`,
        extension_id: 'test-ext',
        url: `https://domain${i % 60}.com/api`,
        method: 'GET',
        timestamp: new Date(),
      }));

      vi.mocked(prisma.networkLog.findMany).mockResolvedValue(mockLogs);

      const analysis = await networkMonitor.analyzeNetworkPatterns('test-ext');

      expect(analysis.uniqueDomains).toBeGreaterThan(50);
      expect(analysis.anomalies.some((a: string) => a.includes('unique domains'))).toBe(true);
    });

    it('should detect high external request ratio', async () => {
      const mockLogs = Array(100).fill(null).map((_, i) => ({
        id: `log-${i}`,
        extension_id: 'test-ext',
        url: 'https://external-api.com/data',
        method: 'POST',
        timestamp: new Date(),
      }));

      vi.mocked(prisma.networkLog.findMany).mockResolvedValue(mockLogs);

      const analysis = await networkMonitor.analyzeNetworkPatterns('test-ext');

      expect(analysis.externalRequests).toBeGreaterThan(80);
    });

    it('should detect excessive POST requests', async () => {
      const mockLogs = Array(150).fill(null).map((_, i) => ({
        id: `log-${i}`,
        extension_id: 'test-ext',
        url: 'https://api.com/track',
        method: 'POST',
        timestamp: new Date(),
      }));

      vi.mocked(prisma.networkLog.findMany).mockResolvedValue(mockLogs);

      const analysis = await networkMonitor.analyzeNetworkPatterns('test-ext');

      expect(analysis.methods.POST).toBe(150);
      expect(analysis.anomalies.some(a => a.includes('POST'))).toBe(true);
    });

    it('should provide top domains list', async () => {
      const mockLogs = [
        { url: 'https://api1.com/v1', method: 'GET' },
        { url: 'https://api1.com/v2', method: 'GET' },
        { url: 'https://api2.com/data', method: 'GET' },
      ].map((log, i) => ({
        ...log,
        id: `log-${i}`,
        extension_id: 'test-ext',
        timestamp: new Date(),
      }));

      vi.mocked(prisma.networkLog.findMany).mockResolvedValue(mockLogs);

      const analysis = await networkMonitor.analyzeNetworkPatterns('test-ext');

      expect(analysis.topDomains).toBeDefined();
      expect(analysis.topDomains.length).toBeGreaterThan(0);
    });

    it('should handle empty logs', async () => {
      vi.mocked(prisma.networkLog.findMany).mockResolvedValue([]);

      const analysis = await networkMonitor.analyzeNetworkPatterns('test-ext');

      expect(analysis.totalRequests).toBe(0);
      expect(analysis.uniqueDomains).toBe(0);
      expect(analysis.anomalies).toHaveLength(0);
    });
  });

  describe('Domain extraction', () => {
    it('should extract domain from various URL formats', () => {
      const urls = [
        'https://example.com/path',
        'http://subdomain.example.com:8080/path',
        'https://example.com',
      ];

      urls.forEach(url => {
        const domain = new URL(url).hostname;
        expect(domain).toMatch(/example\.com/);
      });
    });
  });
});
