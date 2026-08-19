import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { Severity } from '@prisma/client';

interface ThreatCheckResult {
  isThreat: boolean;
  threats: any[];
  severity: Severity | null;
  confidence: number;
}

export class ThreatIntelligenceService {
  /**
   * Check if an extension is known to be malicious
   */
  async checkExtension(extensionId: string): Promise<ThreatCheckResult> {
    const threats = await prisma.threatIntelligence.findMany({
      where: {
        extension_id: extensionId,
        active: true,
        false_positive: false,
      },
      orderBy: { confidence: 'desc' },
    });

    if (threats.length === 0) {
      return { isThreat: false, threats: [], severity: null, confidence: 0 };
    }

    // Get highest severity
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    let highestSeverity: Severity = 'info';

    for (const severity of severities) {
      if (threats.some(t => t.severity === severity)) {
        highestSeverity = severity;
        break;
      }
    }

    // Average confidence
    const avgConfidence = threats.reduce((sum, t) => sum + t.confidence, 0) / threats.length;

    return {
      isThreat: true,
      threats,
      severity: highestSeverity,
      confidence: avgConfidence,
    };
  }

  /**
   * Check if a domain is known to be malicious
   */
  async checkDomain(domain: string): Promise<ThreatCheckResult> {
    const threats = await prisma.threatIntelligence.findMany({
      where: {
        domain,
        type: 'domain',
        active: true,
        false_positive: false,
      },
      orderBy: { confidence: 'desc' },
    });

    if (threats.length === 0) {
      return { isThreat: false, threats: [], severity: null, confidence: 0 };
    }

    const highestSeverity = this.getHighestSeverity(threats);
    const avgConfidence = this.calculateAverageConfidence(threats);

    return {
      isThreat: true,
      threats,
      severity: highestSeverity,
      confidence: avgConfidence,
    };
  }

  /**
   * Check code against known malicious patterns
   */
  async checkCodePattern(code: string): Promise<ThreatCheckResult> {
    const patterns = await prisma.threatIntelligence.findMany({
      where: {
        type: 'code_pattern',
        active: true,
        false_positive: false,
      },
    });

    const matchedThreats = [];

    for (const pattern of patterns) {
      if (!pattern.pattern) continue;

      try {
        const regex = new RegExp(pattern.pattern, 'gi');
        if (regex.test(code)) {
          matchedThreats.push(pattern);
        }
      } catch (error) {
        logger.warn({ error, pattern: pattern.pattern }, 'Invalid regex pattern in threat intelligence');
      }
    }

    if (matchedThreats.length === 0) {
      return { isThreat: false, threats: [], severity: null, confidence: 0 };
    }

    const highestSeverity = this.getHighestSeverity(matchedThreats);
    const avgConfidence = this.calculateAverageConfidence(matchedThreats);

    return {
      isThreat: true,
      threats: matchedThreats,
      severity: highestSeverity,
      confidence: avgConfidence,
    };
  }

  /**
   * Add a new threat to the database
   */
  async addThreat(data: {
    extensionId?: string;
    pattern?: string;
    domain?: string;
    type: 'extension' | 'domain' | 'code_pattern' | 'maintainer' | 'supply_chain';
    severity: Severity;
    description: string;
    source: string;
    confidence: number;
    metadata?: any;
  }): Promise<any> {
    const threat = await prisma.threatIntelligence.create({
      data: {
        extension_id: data.extensionId,
        pattern: data.pattern,
        domain: data.domain,
        type: data.type,
        severity: data.severity,
        description: data.description,
        source: data.source,
        confidence: data.confidence,
        metadata: data.metadata || {},
        active: true,
        false_positive: false,
      },
    });

    logger.info({ threatId: threat.id, type: data.type, severity: data.severity }, 'New threat added to intelligence database');

    return threat;
  }

  /**
   * Verify a threat (mark as verified)
   */
  async verifyThreat(threatId: string, verifiedBy: string): Promise<void> {
    await prisma.threatIntelligence.update({
      where: { id: threatId },
      data: {
        verified_at: new Date(),
        verified_by: verifiedBy,
        confidence: 1.0, // Verified threats have 100% confidence
      },
    });

    logger.info({ threatId, verifiedBy }, 'Threat verified');
  }

  /**
   * Mark threat as false positive
   */
  async markFalsePositive(threatId: string, reason: string): Promise<void> {
    await prisma.threatIntelligence.update({
      where: { id: threatId },
      data: {
        false_positive: true,
        active: false,
        metadata: {
          false_positive_reason: reason,
        },
      },
    });

    logger.info({ threatId, reason }, 'Threat marked as false positive');
  }

  /**
   * Process community report and potentially create threat
   */
  async processCommunityReport(reportId: string, action: 'verify' | 'reject', reviewerId: string, notes?: string): Promise<void> {
    const report = await prisma.communityReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    if (action === 'verify') {
      // Create threat intelligence entry
      const threat = await this.addThreat({
        extensionId: report.extension_id,
        type: 'extension',
        severity: this.mapReportTypeToSeverity(report.report_type),
        description: `Community reported: ${report.description}`,
        source: 'community',
        confidence: 0.7, // Community reports start at 70% confidence
        metadata: {
          reportId: report.id,
          reportedBy: report.user_id,
        },
      });

      // Update report status
      await prisma.communityReport.update({
        where: { id: reportId },
        data: {
          status: 'verified',
          reviewed_at: new Date(),
          reviewed_by: reviewerId,
          review_notes: notes,
          threat_intel_id: threat.id,
        },
      });

      logger.info({ reportId, threatId: threat.id }, 'Community report verified and threat created');
    } else {
      // Reject report
      await prisma.communityReport.update({
        where: { id: reportId },
        data: {
          status: 'rejected',
          reviewed_at: new Date(),
          reviewed_by: reviewerId,
          review_notes: notes,
        },
      });

      logger.info({ reportId }, 'Community report rejected');
    }
  }

  /**
   * Submit a community report
   */
  async submitCommunityReport(data: {
    userId: string;
    extensionId: string;
    extensionName: string;
    extensionVersion?: string;
    reportType: string;
    description: string;
    evidence?: any;
  }): Promise<any> {
    const report = await prisma.communityReport.create({
      data: {
        user_id: data.userId,
        extension_id: data.extensionId,
        extension_name: data.extensionName,
        extension_version: data.extensionVersion,
        report_type: data.reportType,
        description: data.description,
        evidence: data.evidence,
        status: 'pending',
      },
    });

    logger.info({ reportId: report.id, userId: data.userId, extensionId: data.extensionId }, 'Community report submitted');

    return report;
  }

  /**
   * Get pending community reports for review
   */
  async getPendingReports(limit = 20): Promise<any[]> {
    return prisma.communityReport.findMany({
      where: { status: 'pending' },
      orderBy: { reported_at: 'desc' },
      take: limit,
    });
  }

  /**
   * Get active threats
   */
  async getActiveThreats(type?: string, severity?: Severity, limit = 50): Promise<any[]> {
    const where: any = {
      active: true,
      false_positive: false,
    };

    if (type) where.type = type;
    if (severity) where.severity = severity;

    return prisma.threatIntelligence.findMany({
      where,
      orderBy: [
        { severity: 'desc' },
        { confidence: 'desc' },
      ],
      take: limit,
    });
  }

  /**
   * Bulk import threats (from external sources)
   */
  async bulkImportThreats(threats: any[], source: string): Promise<{ imported: number; failed: number }> {
    let imported = 0;
    let failed = 0;

    for (const threat of threats) {
      try {
        await this.addThreat({
          extensionId: threat.extensionId,
          pattern: threat.pattern,
          domain: threat.domain,
          type: threat.type,
          severity: threat.severity,
          description: threat.description,
          source,
          confidence: threat.confidence || 0.8,
          metadata: threat.metadata,
        });
        imported++;
      } catch (error) {
        logger.error({ error, threat }, 'Failed to import threat');
        failed++;
      }
    }

    logger.info({ imported, failed, source }, 'Bulk threat import completed');

    return { imported, failed };
  }

  /**
   * Helper: Get highest severity from threat list
   */
  private getHighestSeverity(threats: any[]): Severity {
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

    for (const severity of severities) {
      if (threats.some(t => t.severity === severity)) {
        return severity;
      }
    }

    return 'info';
  }

  /**
   * Helper: Calculate average confidence
   */
  private calculateAverageConfidence(threats: any[]): number {
    if (threats.length === 0) return 0;
    return threats.reduce((sum, t) => sum + t.confidence, 0) / threats.length;
  }

  /**
   * Helper: Map report type to severity
   */
  private mapReportTypeToSeverity(reportType: string): Severity {
    const mapping: Record<string, Severity> = {
      'malicious': 'critical',
      'data_theft': 'critical',
      'privacy_violation': 'high',
      'suspicious': 'medium',
      'annoying': 'low',
    };

    return mapping[reportType] || 'medium';
  }
}

export const threatIntel = new ThreatIntelligenceService();
