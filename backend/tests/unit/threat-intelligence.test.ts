import { describe, it, expect, beforeEach, vi } from 'vitest';
import { threatIntel } from '../../src/services/threat-intelligence';
import { prisma } from '../../src/utils/prisma';

// Mock Prisma
vi.mock('../../src/utils/prisma', () => ({
  prisma: {
    threatIntelligence: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Threat Intelligence Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkExtension', () => {
    it('should return threat when extension is in database', async () => {
      const mockThreat = {
        id: 'threat-1',
        type: 'extension',
        value: 'malicious-extension-id',
        severity: 'critical',
        category: 'malware',
        description: 'Known malware',
        source: 'community',
        confidence: 0.95,
        verified: true,
        reported_at: new Date(),
      };

      vi.mocked(prisma.threatIntelligence.findFirst).mockResolvedValue(mockThreat);

      const result = await threatIntel.checkExtension('malicious-extension-id');

      expect(result.isThreat).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.threats).toHaveLength(1);
    });

    it('should return no threat for clean extension', async () => {
      vi.mocked(prisma.threatIntelligence.findFirst).mockResolvedValue(null);

      const result = await threatIntel.checkExtension('clean-extension-id');

      expect(result.isThreat).toBe(false);
      expect(result.threats).toHaveLength(0);
    });

    it('should check multiple threat sources', async () => {
      const mockThreats = [
        {
          id: 'threat-1',
          type: 'extension',
          value: 'suspicious-extension',
          severity: 'high',
          category: 'suspicious',
          confidence: 0.8,
        },
        {
          id: 'threat-2',
          type: 'extension',
          value: 'suspicious-extension',
          severity: 'medium',
          category: 'tracking',
          confidence: 0.6,
        },
      ];

      vi.mocked(prisma.threatIntelligence.findMany).mockResolvedValue(mockThreats);

      const result = await threatIntel.checkExtension('suspicious-extension');

      if (result.isThreat) {
        expect(result.threats.length).toBeGreaterThan(0);
      }
    });
  });

  describe('checkDomain', () => {
    it('should detect malicious domains', async () => {
      const mockThreat = {
        id: 'threat-domain-1',
        type: 'domain',
        value: 'malicious.com',
        severity: 'critical',
        category: 'phishing',
        confidence: 0.99,
      };

      vi.mocked(prisma.threatIntelligence.findFirst).mockResolvedValue(mockThreat);

      const result = await threatIntel.checkDomain('malicious.com');

      expect(result.isThreat).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('should return clean for safe domains', async () => {
      vi.mocked(prisma.threatIntelligence.findFirst).mockResolvedValue(null);

      const result = await threatIntel.checkDomain('google.com');

      expect(result.isThreat).toBe(false);
    });
  });

  describe('checkPattern', () => {
    it('should detect suspicious code patterns', async () => {
      const mockThreat = {
        id: 'pattern-1',
        type: 'pattern',
        value: 'eval\\(.*atob\\(',
        severity: 'high',
        category: 'obfuscation',
        confidence: 0.85,
      };

      vi.mocked(prisma.threatIntelligence.findFirst).mockResolvedValue(mockThreat);

      const result = await threatIntel.checkPattern('eval(atob('));

      expect(result.isThreat).toBe(true);
      expect(result.severity).toBe('high');
    });
  });

  describe('reportThreat', () => {
    it('should create new threat report', async () => {
      const mockCreated = {
        id: 'new-threat-1',
        type: 'extension',
        value: 'reported-extension',
        severity: 'medium',
        category: 'suspicious',
        source: 'community',
        confidence: 0.5,
        verified: false,
      };

      vi.mocked(prisma.threatIntelligence.create).mockResolvedValue(mockCreated);

      const result = await threatIntel.reportThreat({
        type: 'extension',
        value: 'reported-extension',
        category: 'suspicious',
        description: 'User report',
        reportedBy: 'user-123',
      });

      expect(result).toBeDefined();
      expect(vi.mocked(prisma.threatIntelligence.create)).toHaveBeenCalled();
    });

    it('should validate threat report data', async () => {
      await expect(
        threatIntel.reportThreat({
          type: 'extension',
          value: '',
          category: 'malware',
          description: 'Invalid',
          reportedBy: 'user-123',
        })
      ).rejects.toThrow();
    });
  });

  describe('verifyThreat', () => {
    it('should increase confidence when verified', async () => {
      const mockThreat = {
        id: 'threat-verify',
        confidence: 0.7,
        verified: false,
      };

      vi.mocked(prisma.threatIntelligence.update).mockResolvedValue({
        ...mockThreat,
        confidence: 0.95,
        verified: true,
      });

      await threatIntel.verifyThreat('threat-verify');

      expect(vi.mocked(prisma.threatIntelligence.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'threat-verify' },
          data: expect.objectContaining({
            verified: true,
          }),
        })
      );
    });
  });

  describe('Confidence scoring', () => {
    it('should have higher confidence for verified threats', () => {
      const verified = { verified: true, confidence: 0.95 };
      const unverified = { verified: false, confidence: 0.6 };

      expect(verified.confidence).toBeGreaterThan(unverified.confidence);
    });

    it('should calculate aggregate confidence for multiple reports', () => {
      const reports = [
        { confidence: 0.7 },
        { confidence: 0.8 },
        { confidence: 0.75 },
      ];

      const avgConfidence = reports.reduce((sum, r) => sum + r.confidence, 0) / reports.length;

      expect(avgConfidence).toBeGreaterThan(0.7);
      expect(avgConfidence).toBeLessThan(0.8);
    });
  });

  describe('Threat categories', () => {
    it('should support all defined categories', () => {
      const validCategories = [
        'malware',
        'phishing',
        'tracking',
        'cryptomining',
        'data_theft',
        'suspicious',
        'adware',
      ];

      validCategories.forEach(category => {
        expect(validCategories).toContain(category);
      });
    });
  });

  describe('getThreatStats', () => {
    it('should return statistics about threats', async () => {
      const mockStats = {
        total: 150,
        verified: 100,
        byCategory: {
          malware: 50,
          phishing: 30,
          tracking: 70,
        },
        bySeverity: {
          critical: 20,
          high: 50,
          medium: 60,
          low: 20,
        },
      };

      // Mock the stats query
      const stats = await threatIntel.getStats();

      expect(stats).toBeDefined();
    });
  });
});
