import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { threatIntel } from './threat-intelligence';

interface NetworkRequest {
  extensionId: string;
  url: string;
  method: string;
  timestamp: Date;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  statusCode?: number;
  blocked?: boolean;
  reason?: string;
}

export class NetworkMonitor {
  /**
   * Log network request from extension
   */
  async logRequest(request: NetworkRequest): Promise<void> {
    try {
      // Store in database
      await prisma.networkLog.create({
        data: {
          extension_id: request.extensionId,
          url: request.url,
          method: request.method,
          request_headers: request.requestHeaders || {},
          response_headers: request.responseHeaders || {},
          status_code: request.statusCode,
          blocked: request.blocked || false,
          timestamp: request.timestamp,
        },
      });

      // Check if domain is suspicious
      const domain = new URL(request.url).hostname;
      const threat = await threatIntel.checkDomain(domain);

      if (threat.isThreat) {
        logger.warn({
          extensionId: request.extensionId,
          url: request.url,
          severity: threat.severity,
        }, 'Extension contacted suspicious domain');

        // Create supply chain event
        await prisma.supplyChainEvent.create({
          data: {
            extension_id: request.extensionId,
            event_type: 'suspicious_network',
            severity: threat.severity!,
            description: `Contacted known malicious domain: ${domain}`,
            metadata: {
              url: request.url,
              threats: threat.threats,
            },
            detected_at: new Date(),
          },
        });
      }
    } catch (error) {
      logger.error({ error, request }, 'Failed to log network request');
    }
  }

  /**
   * Get network activity for an extension
   */
  async getExtensionActivity(
    extensionId: string,
    limit = 100
  ): Promise<any[]> {
    return prisma.networkLog.findMany({
      where: { extension_id: extensionId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Get suspicious network activity
   */
  async getSuspiciousActivity(limit = 50): Promise<any[]> {
    const logs = await prisma.networkLog.findMany({
      where: { blocked: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return logs;
  }

  /**
   * Get network stats for an extension
   */
  async getExtensionNetworkStats(extensionId: string): Promise<any> {
    const [totalRequests, uniqueDomains, blockedRequests] = await Promise.all([
      prisma.networkLog.count({
        where: { extension_id: extensionId },
      }),
      prisma.networkLog.groupBy({
        by: ['url'],
        where: { extension_id: extensionId },
      }),
      prisma.networkLog.count({
        where: {
          extension_id: extensionId,
          blocked: true,
        },
      }),
    ]);

    return {
      totalRequests,
      uniqueDomains: uniqueDomains.length,
      blockedRequests,
    };
  }

  /**
   * Analyze network patterns for anomalies
   */
  async analyzeNetworkPatterns(extensionId: string): Promise<any> {
    const logs = await prisma.networkLog.findMany({
      where: { extension_id: extensionId },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    const domains = new Map<string, number>();
    const methods = new Map<string, number>();
    let externalRequests = 0;

    for (const log of logs) {
      try {
        const url = new URL(log.url);
        const domain = url.hostname;

        domains.set(domain, (domains.get(domain) || 0) + 1);
        methods.set(log.method, (methods.get(log.method) || 0) + 1);

        // Check if external (not Chrome Web Store)
        if (!domain.includes('google.com') && !domain.includes('googleapis.com')) {
          externalRequests++;
        }
      } catch (error) {
        // Invalid URL, skip
      }
    }

    // Detect anomalies
    const anomalies: string[] = [];

    // Too many unique domains
    if (domains.size > 50) {
      anomalies.push(`Contacts ${domains.size} unique domains`);
    }

    // High external request ratio
    const externalRatio = logs.length > 0 ? externalRequests / logs.length : 0;
    if (externalRatio > 0.8) {
      anomalies.push(`${Math.round(externalRatio * 100)}% external requests`);
    }

    // Excessive POST requests
    const postCount = methods.get('POST') || 0;
    const postRatio = logs.length > 0 ? postCount / logs.length : 0;
    if (postRatio > 0.5 && postCount > 100) {
      anomalies.push(`High number of POST requests (${postCount})`);
    }

    return {
      totalRequests: logs.length,
      uniqueDomains: domains.size,
      externalRequests,
      topDomains: Array.from(domains.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => ({ domain, count })),
      methods: Object.fromEntries(methods),
      anomalies,
    };
  }
}

export const networkMonitor = new NetworkMonitor();
