import { DANGEROUS_PERMISSIONS, RISK_THRESHOLDS } from '@/constants';
import type { Extension } from '@/types';

export interface RiskAnalysis {
  score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
}

export interface RiskFactor {
  category: string;
  description: string;
  impact: number;
}

export class RiskAnalyzer {
  /**
   * Calculate risk score for an extension (0-100)
   */
  analyzeExtension(extension: Extension): RiskAnalysis {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // Check permissions
    const permissionScore = this.analyzePermissions(extension.permissions, factors);
    totalScore += permissionScore;

    // Check host permissions
    const hostScore = this.analyzeHostPermissions(extension.hostPermissions, factors);
    totalScore += hostScore;

    // Check install type
    const installScore = this.analyzeInstallType(extension.installType, factors);
    totalScore += installScore;

    // Check update URL
    const updateScore = this.analyzeUpdateUrl(extension.updateUrl, factors);
    totalScore += updateScore;

    // Clamp score to 0-100
    const score = Math.max(0, Math.min(100, totalScore));
    const severity = this.determineSeverity(score);

    return {
      score,
      severity,
      factors,
    };
  }

  /**
   * Analyze permissions
   */
  private analyzePermissions(permissions: string[], factors: RiskFactor[]): number {
    let score = 0;
    const dangerousFound: string[] = [];

    for (const perm of permissions) {
      if (DANGEROUS_PERMISSIONS.includes(perm)) {
        dangerousFound.push(perm);
        score += 15; // Each dangerous permission adds 15 points
      } else {
        score += 2; // Normal permissions add 2 points
      }
    }

    if (dangerousFound.length > 0) {
      factors.push({
        category: 'Dangerous Permissions',
        description: `Has ${dangerousFound.length} dangerous permission(s): ${dangerousFound.join(', ')}`,
        impact: score,
      });
    } else if (permissions.length > 0) {
      factors.push({
        category: 'Permissions',
        description: `Has ${permissions.length} permission(s)`,
        impact: score,
      });
    }

    return score;
  }

  /**
   * Analyze host permissions
   */
  private analyzeHostPermissions(hostPermissions: string[], factors: RiskFactor[]): number {
    let score = 0;

    if (hostPermissions.length === 0) {
      return 0;
    }

    // Check for broad host permissions
    const hasBroadAccess = hostPermissions.some(host =>
      host === '<all_urls>' ||
      host === '*://*/*' ||
      host === 'http://*/*' ||
      host === 'https://*/*'
    );

    if (hasBroadAccess) {
      score += 25; // Broad access is high risk
      factors.push({
        category: 'Host Permissions',
        description: 'Can access all websites',
        impact: 25,
      });
    } else {
      // Count wildcards
      const wildcardCount = hostPermissions.filter(host => host.includes('*')).length;

      if (wildcardCount > 0) {
        score += wildcardCount * 5;
        factors.push({
          category: 'Host Permissions',
          description: `Can access ${hostPermissions.length} website pattern(s) including ${wildcardCount} wildcard(s)`,
          impact: wildcardCount * 5,
        });
      } else {
        score += hostPermissions.length * 2;
        factors.push({
          category: 'Host Permissions',
          description: `Can access ${hostPermissions.length} specific website(s)`,
          impact: hostPermissions.length * 2,
        });
      }
    }

    return score;
  }

  /**
   * Analyze install type
   */
  private analyzeInstallType(installType: string, factors: RiskFactor[]): number {
    let score = 0;

    switch (installType) {
      case 'normal':
        // Normal Chrome Web Store install - safe
        break;

      case 'development':
        score += 10;
        factors.push({
          category: 'Install Type',
          description: 'Installed as developer extension (not from Chrome Web Store)',
          impact: 10,
        });
        break;

      case 'sideload':
        score += 15;
        factors.push({
          category: 'Install Type',
          description: 'Sideloaded (installed from file, not verified by store)',
          impact: 15,
        });
        break;

      case 'admin':
        score += 5;
        factors.push({
          category: 'Install Type',
          description: 'Installed by administrator policy',
          impact: 5,
        });
        break;

      case 'other':
        score += 20;
        factors.push({
          category: 'Install Type',
          description: 'Unknown install method',
          impact: 20,
        });
        break;
    }

    return score;
  }

  /**
   * Analyze update URL
   */
  private analyzeUpdateUrl(updateUrl: string | undefined, factors: RiskFactor[]): number {
    if (!updateUrl) {
      return 0; // Chrome Web Store updates are safe
    }

    let score = 0;

    // Check if update URL is from Chrome Web Store
    if (updateUrl.includes('chrome.google.com')) {
      return 0; // Safe
    }

    // Custom update URL - potential supply chain risk
    score += 10;
    factors.push({
      category: 'Update Source',
      description: `Uses custom update URL: ${this.sanitizeUrl(updateUrl)}`,
      impact: 10,
    });

    // Check for insecure URL
    if (updateUrl.startsWith('http://')) {
      score += 15;
      factors.push({
        category: 'Update Security',
        description: 'Update URL uses insecure HTTP',
        impact: 15,
      });
    }

    return score;
  }

  /**
   * Determine severity based on score
   */
  private determineSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= RISK_THRESHOLDS.critical) return 'critical';
    if (score >= RISK_THRESHOLDS.high) return 'high';
    if (score >= RISK_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Sanitize URL for display
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url.substring(0, 50);
    }
  }

  /**
   * Get color for severity
   */
  static getSeverityColor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
    switch (severity) {
      case 'low':
        return '#10B981'; // green
      case 'medium':
        return '#F59E0B'; // yellow
      case 'high':
        return '#EF4444'; // red
      case 'critical':
        return '#7F1D1D'; // dark red
    }
  }

  /**
   * Get badge text for score
   */
  static getScoreBadge(score: number): string {
    if (score >= 85) return '!';
    if (score >= 70) return '⚠';
    if (score >= 50) return '~';
    return '✓';
  }
}

// Singleton instance
export const riskAnalyzer = new RiskAnalyzer();
