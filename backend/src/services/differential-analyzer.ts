import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { Severity } from '@prisma/client';

interface ManifestDiff {
  permissionsAdded: string[];
  permissionsRemoved: string[];
  hostPermissionsAdded: string[];
  hostPermissionsRemoved: string[];
  manifestChanges: Record<string, any>;
}

interface DifferentialAnalysisResult {
  extensionId: string;
  oldVersion: string;
  newVersion: string;
  permissionsAdded: string[];
  permissionsRemoved: string[];
  hostPermissionsAdded: string[];
  hostPermissionsRemoved: string[];
  manifestChanges: Record<string, any>;
  riskDelta: number;
  severity: Severity;
  findingsAdded: number;
  findingsRemoved: number;
  summary: string;
}

export class DifferentialAnalyzer {
  /**
   * Compare two extension versions and generate analysis
   */
  async analyzeVersionDiff(
    extensionId: string,
    oldVersionId: string,
    newVersionId: string
  ): Promise<DifferentialAnalysisResult | null> {
    try {
      // Fetch both versions from database
      const [oldVersion, newVersion] = await Promise.all([
        prisma.extensionVersion.findUnique({ where: { id: oldVersionId } }),
        prisma.extensionVersion.findUnique({ where: { id: newVersionId } }),
      ]);

      if (!oldVersion || !newVersion) {
        logger.error({ extensionId, oldVersionId, newVersionId }, 'Version not found for diff');
        return null;
      }

      // Compute manifest diff
      const manifestDiff = this.computeManifestDiff(oldVersion, newVersion);

      // Calculate risk delta
      const riskDelta = this.calculateRiskDelta(manifestDiff);

      // Determine severity
      const severity = this.determineSeverity(riskDelta, manifestDiff);

      // Compare findings if scans exist
      let findingsAdded = 0;
      let findingsRemoved = 0;

      if (oldVersion.scan_id && newVersion.scan_id) {
        const findingsDiff = await this.compareScanFindings(
          oldVersion.scan_id,
          newVersion.scan_id
        );
        findingsAdded = findingsDiff.added;
        findingsRemoved = findingsDiff.removed;
      }

      // Generate summary
      const summary = this.generateSummary(manifestDiff, riskDelta, severity);

      const result: DifferentialAnalysisResult = {
        extensionId,
        oldVersion: oldVersion.version,
        newVersion: newVersion.version,
        permissionsAdded: manifestDiff.permissionsAdded,
        permissionsRemoved: manifestDiff.permissionsRemoved,
        hostPermissionsAdded: manifestDiff.hostPermissionsAdded,
        hostPermissionsRemoved: manifestDiff.hostPermissionsRemoved,
        manifestChanges: manifestDiff.manifestChanges,
        riskDelta,
        severity,
        findingsAdded,
        findingsRemoved,
        summary,
      };

      // Store in database
      await this.storeDifferentialAnalysis(result);

      logger.info({
        extensionId,
        oldVersion: oldVersion.version,
        newVersion: newVersion.version,
        riskDelta,
        severity,
      }, 'Differential analysis completed');

      return result;
    } catch (error) {
      logger.error({ error, extensionId }, 'Differential analysis failed');
      return null;
    }
  }

  /**
   * Compute differences in manifest between versions
   */
  private computeManifestDiff(oldVersion: any, newVersion: any): ManifestDiff {
    const oldPerms = new Set(oldVersion.permissions as string[] || []);
    const newPerms = new Set(newVersion.permissions as string[] || []);

    const oldHostPerms = new Set(oldVersion.host_permissions as string[] || []);
    const newHostPerms = new Set(newVersion.host_permissions as string[] || []);

    const permissionsAdded = [...newPerms].filter(p => !oldPerms.has(p));
    const permissionsRemoved = [...oldPerms].filter(p => !newPerms.has(p));

    const hostPermissionsAdded = [...newHostPerms].filter(p => !oldHostPerms.has(p));
    const hostPermissionsRemoved = [...oldHostPerms].filter(p => !newHostPerms.has(p));

    // Detect other manifest changes
    const manifestChanges: Record<string, any> = {};
    const oldManifest = oldVersion.manifest as Record<string, any>;
    const newManifest = newVersion.manifest as Record<string, any>;

    // Check for content security policy changes
    if (oldManifest.content_security_policy !== newManifest.content_security_policy) {
      manifestChanges.content_security_policy = {
        old: oldManifest.content_security_policy,
        new: newManifest.content_security_policy,
      };
    }

    // Check for update URL changes
    if (oldManifest.update_url !== newManifest.update_url) {
      manifestChanges.update_url = {
        old: oldManifest.update_url,
        new: newManifest.update_url,
      };
    }

    // Check for homepage URL changes
    if (oldManifest.homepage_url !== newManifest.homepage_url) {
      manifestChanges.homepage_url = {
        old: oldManifest.homepage_url,
        new: newManifest.homepage_url,
      };
    }

    return {
      permissionsAdded,
      permissionsRemoved,
      hostPermissionsAdded,
      hostPermissionsRemoved,
      manifestChanges,
    };
  }

  /**
   * Calculate risk delta score (-100 to +100)
   */
  private calculateRiskDelta(diff: ManifestDiff): number {
    let delta = 0;

    // Dangerous permissions
    const dangerousPermissions = [
      'cookies',
      'webRequest',
      'webRequestBlocking',
      'proxy',
      'debugger',
      'management',
      'nativeMessaging',
      'privacy',
      'processes',
      'tabCapture',
      'browsingData',
      '<all_urls>',
      '*://*/*',
      'http://*/*',
      'https://*/*',
    ];

    // Added dangerous permissions - high risk increase
    for (const perm of diff.permissionsAdded) {
      if (dangerousPermissions.includes(perm)) {
        delta += 25;
      } else {
        delta += 5;
      }
    }

    // Added broad host permissions
    for (const host of diff.hostPermissionsAdded) {
      if (host === '<all_urls>' || host.includes('*://*/*')) {
        delta += 30;
      } else if (host.includes('*')) {
        delta += 15;
      } else {
        delta += 5;
      }
    }

    // Removed permissions - slight risk decrease
    delta -= diff.permissionsRemoved.length * 2;
    delta -= diff.hostPermissionsRemoved.length * 2;

    // CSP changes - potential risk increase
    if (diff.manifestChanges.content_security_policy) {
      const oldCSP = diff.manifestChanges.content_security_policy.old || '';
      const newCSP = diff.manifestChanges.content_security_policy.new || '';

      // Check if CSP was weakened
      if (oldCSP && newCSP.length < oldCSP.length) {
        delta += 20; // CSP weakened
      }
    }

    // Clamp to -100 to +100
    return Math.max(-100, Math.min(100, delta));
  }

  /**
   * Determine overall severity based on risk delta and changes
   */
  private determineSeverity(riskDelta: number, diff: ManifestDiff): Severity {
    // Critical: Major risk increase
    if (riskDelta >= 50) {
      return 'critical';
    }

    // High: Moderate risk increase or specific dangerous changes
    if (riskDelta >= 25) {
      return 'high';
    }

    // Check for specific dangerous patterns
    const dangerousAdded = diff.permissionsAdded.some(p =>
      ['cookies', 'webRequest', '<all_urls>'].includes(p)
    );

    if (dangerousAdded) {
      return 'high';
    }

    // Medium: Small risk increase
    if (riskDelta >= 10) {
      return 'medium';
    }

    // Low: Minimal changes or risk decrease
    if (riskDelta > 0) {
      return 'low';
    }

    // Info: No risk increase
    return 'info';
  }

  /**
   * Compare findings between two scans
   */
  private async compareScanFindings(
    oldScanId: string,
    newScanId: string
  ): Promise<{ added: number; removed: number }> {
    const [oldFindings, newFindings] = await Promise.all([
      prisma.finding.findMany({ where: { scan_id: oldScanId } }),
      prisma.finding.findMany({ where: { scan_id: newScanId } }),
    ]);

    // Simple count-based comparison
    // TODO: More sophisticated matching based on finding content
    const added = Math.max(0, newFindings.length - oldFindings.length);
    const removed = Math.max(0, oldFindings.length - newFindings.length);

    return { added, removed };
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(diff: ManifestDiff, riskDelta: number, severity: Severity): string {
    const parts: string[] = [];

    if (diff.permissionsAdded.length > 0) {
      parts.push(`Added ${diff.permissionsAdded.length} permission(s): ${diff.permissionsAdded.slice(0, 3).join(', ')}`);
    }

    if (diff.hostPermissionsAdded.length > 0) {
      parts.push(`Added ${diff.hostPermissionsAdded.length} host permission(s)`);
    }

    if (diff.permissionsRemoved.length > 0) {
      parts.push(`Removed ${diff.permissionsRemoved.length} permission(s)`);
    }

    if (Object.keys(diff.manifestChanges).length > 0) {
      parts.push(`Modified ${Object.keys(diff.manifestChanges).length} manifest field(s)`);
    }

    if (parts.length === 0) {
      return 'No significant changes detected';
    }

    const changesSummary = parts.join('. ');
    const riskIndicator = riskDelta > 0 ? `Risk increased by ${riskDelta}` : `Risk decreased by ${Math.abs(riskDelta)}`;

    return `${changesSummary}. ${riskIndicator}. Severity: ${severity}`;
  }

  /**
   * Store differential analysis in database
   */
  private async storeDifferentialAnalysis(result: DifferentialAnalysisResult): Promise<void> {
    await prisma.differentialAnalysis.create({
      data: {
        extension_id: result.extensionId,
        old_version: result.oldVersion,
        new_version: result.newVersion,
        permissions_added: result.permissionsAdded,
        permissions_removed: result.permissionsRemoved,
        host_permissions_added: result.hostPermissionsAdded,
        host_permissions_removed: result.hostPermissionsRemoved,
        manifest_changes: result.manifestChanges,
        risk_delta: result.riskDelta,
        severity: result.severity,
        findings_added: result.findingsAdded,
        findings_removed: result.findingsRemoved,
      },
    });
  }

  /**
   * Get differential analysis history for an extension
   */
  async getAnalysisHistory(extensionId: string, limit = 10): Promise<any[]> {
    return prisma.differentialAnalysis.findMany({
      where: { extension_id: extensionId },
      orderBy: { analysis_date: 'desc' },
      take: limit,
    });
  }
}

export const differentialAnalyzer = new DifferentialAnalyzer();
