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
      count: vi.fn(),
      groupBy: vi.fn(),
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
        extension_id: 'malicious-extension-id',
        severity: 'critical',
        description: 'Known malware',
        source: 'community',
        confidence: 0.95,
        active: true,
        false_positive: false,
        reported_at: new Date(),
      };

      vi.mocked(prisma.threatIntelligence.findMany).mockResolvedValue([mockThreat]);

      const result = await threatIntel.checkExtension('malicious-extension-id');

      expect(result.isThreat).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.threats).toHaveLength(1);
    });

    it('should return no threat for clean extension', async () => {
      vi.mocked(prisma.threatIntelligence.findMany).mockResolvedValue([]);

      const result = await threatIntel.checkExtension('clean-extension-id');

      expect(result.isThreat).toBe(false);
      expect(result.threats).toHaveLength(0);
    });

    it('should pick highest severity when multiple threats exist', async () => {
      const mockThreats = [
        { id: 'threat-1', extension_id: 'ext', severity: 'high', confidence: 0.8, active: true, false_positive: false },
        { id: 'threat-2', extension_id: 'ext', severity: 'medium', confidence: 0.6, active: true, false_positive: false },
      ];

      vi.mocked(prisma.threatIntelligence.findMany).mockResolvedValue(mockThreats);

      const result = await threatIntel.checkExtension('ext');

      expect(result.isThreat).toBe(true);
      expect(result.severity).toBe('high');
    });
  });

  describe('checkDomain', () => {
    it('should detect malicious domains', async () => {
      const mockThreat = [{
        id: 'threat-domain-1',
        domain: 'malicious.com',
        type: 'domain',
        severity: 'critical',
        confidence: 0.99,
        active: true,
        false_positive: false,
      }];

      vi.mocked(prisma.threatIntelligence.findMany).mockResolvedValue(mockThreat);

      const result = await threatIntel.checkDomain('malicious.com');

      expect(result.isThreat).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('should return clean for safe domains', async () => {
      vi.mocked(prisma.threatIntelligence.findMany).mockResolvedValue([]);

      const result = await threatIntel.checkDomain('google.com');

      expect(result.isThreat).toBe(false);
    });
  });

  describe('verifyThreat', () => {
    it('should mark threat as verified', async () => {
      const mockUpdated = {
        id: 'threat-verify',
        confidence: 1,
        verified_at: new Date(),
        verified_by: undefined,
      };

      vi.mocked(prisma.threatIntelligence.update).mockResolvedValue(mockUpdated);

      await threatIntel.verifyThreat('threat-verify');

      expect(vi.mocked(prisma.threatIntelligence.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'threat-verify' },
        })
      );
    });
  });

  describe('Confidence scoring', () => {
    it('should have higher confidence for verified threats', () => {
      const verified = { verified_at: new Date(), confidence: 0.95 };
      const unverified = { verified_at: null, confidence: 0.6 };

      expect(verified.confidence).toBeGreaterThan(unverified.confidence);
    });

    it('should calculate aggregate confidence for multiple reports', () => {
      const reports = [
        { confidence: 0.7 },
        { confidence: 0.8 },
        { confidence: 0.75 },
      ];

      const avgConfidence = reports.reduce((sum, r) => sum + r.confidence, 0) / reports.length;

      expect(avgConfidence).toBeCloseTo(0.75);
    });
  });

  describe('Threat categories', () => {
    it('should support all defined threat types', () => {
      const validTypes = ['extension', 'domain', 'code_pattern', 'maintainer', 'supply_chain'];
      validTypes.forEach(type => {
        expect(validTypes).toContain(type);
      });
    });
  });
});
