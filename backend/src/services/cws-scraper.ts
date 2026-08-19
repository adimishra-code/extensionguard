import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { differentialAnalyzer } from './differential-analyzer';
import { wsManager } from './websocket-manager';

interface CWSExtensionInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  author_email?: string;
  category?: string;
  rating?: number;
  rating_count?: number;
  user_count?: number;
  homepage_url?: string;
  support_url?: string;
  privacy_policy_url?: string;
  featured?: boolean;
  last_updated?: Date;
  manifest?: any;
  permissions?: string[];
  host_permissions?: string[];
}

export class CWSScraperService {
  private scrapeInProgress = new Set<string>();

  /**
   * Scrape extension metadata from Chrome Web Store
   * Note: This is a simplified version - real implementation would use
   * Playwright/Puppeteer to scrape the actual CWS
   */
  async scrapeExtension(extensionId: string): Promise<CWSExtensionInfo | null> {
    if (this.scrapeInProgress.has(extensionId)) {
      logger.debug({ extensionId }, 'Scrape already in progress');
      return null;
    }

    this.scrapeInProgress.add(extensionId);

    try {
      logger.info({ extensionId }, 'Starting CWS scrape');

      // TODO: Implement actual CWS scraping with Playwright
      // For now, return mock data structure
      const cwsUrl = `https://chrome.google.com/webstore/detail/${extensionId}`;

      // In real implementation:
      // 1. Launch Playwright browser
      // 2. Navigate to CWS URL
      // 3. Extract metadata from page
      // 4. Download CRX file
      // 5. Parse manifest.json
      // 6. Extract permissions

      const info = await this.mockScrape(extensionId);

      if (!info) {
        logger.warn({ extensionId }, 'Extension not found on CWS');
        return null;
      }

      // Store/update CWS metadata
      await this.storeCWSMetadata(info);

      // Check if this is a new version
      await this.checkAndStoreVersion(info);

      logger.info({ extensionId, version: info.version }, 'CWS scrape completed');

      return info;
    } catch (error) {
      logger.error({ error, extensionId }, 'CWS scrape failed');
      return null;
    } finally {
      this.scrapeInProgress.delete(extensionId);
    }
  }

  /**
   * Store or update CWS metadata cache
   */
  private async storeCWSMetadata(info: CWSExtensionInfo): Promise<void> {
    await prisma.cWSMetadata.upsert({
      where: { extension_id: info.id },
      create: {
        extension_id: info.id,
        name: info.name,
        author: info.author,
        author_email: info.author_email,
        category: info.category,
        rating: info.rating,
        rating_count: info.rating_count,
        user_count: info.user_count,
        current_version: info.version,
        last_updated: info.last_updated,
        homepage_url: info.homepage_url,
        support_url: info.support_url,
        privacy_policy_url: info.privacy_policy_url,
        featured: info.featured || false,
        delisted: false,
        metadata: info as any,
        last_scraped_at: new Date(),
      },
      update: {
        name: info.name,
        author: info.author,
        author_email: info.author_email,
        category: info.category,
        rating: info.rating,
        rating_count: info.rating_count,
        user_count: info.user_count,
        current_version: info.version,
        last_updated: info.last_updated,
        homepage_url: info.homepage_url,
        support_url: info.support_url,
        privacy_policy_url: info.privacy_policy_url,
        featured: info.featured || false,
        metadata: info as any,
        last_scraped_at: new Date(),
      },
    });
  }

  /**
   * Check if version is new and store it
   */
  private async checkAndStoreVersion(info: CWSExtensionInfo): Promise<void> {
    // Check if we already have this version
    const existing = await prisma.extensionVersion.findUnique({
      where: {
        extension_id_version: {
          extension_id: info.id,
          version: info.version,
        },
      },
    });

    if (existing) {
      logger.debug({ extensionId: info.id, version: info.version }, 'Version already stored');
      return;
    }

    // Store new version
    const newVersion = await prisma.extensionVersion.create({
      data: {
        extension_id: info.id,
        version: info.version,
        name: info.name,
        description: info.description,
        permissions: info.permissions || [],
        host_permissions: info.host_permissions || [],
        manifest: info.manifest || {},
        release_date: info.last_updated,
        detected_at: new Date(),
      },
    });

    logger.info({ extensionId: info.id, version: info.version }, 'New version stored');

    // Create supply chain event
    await prisma.supplyChainEvent.create({
      data: {
        extension_version_id: newVersion.id,
        extension_id: info.id,
        event_type: 'version_released',
        severity: 'info',
        description: `New version ${info.version} released`,
        detected_at: new Date(),
      },
    });

    // Check if we should run differential analysis
    await this.triggerDifferentialAnalysis(info.id, newVersion.id);
  }

  /**
   * Trigger differential analysis if previous version exists
   */
  private async triggerDifferentialAnalysis(extensionId: string, newVersionId: string): Promise<void> {
    // Get previous version
    const versions = await prisma.extensionVersion.findMany({
      where: { extension_id: extensionId },
      orderBy: { detected_at: 'desc' },
      take: 2,
    });

    if (versions.length < 2) {
      logger.debug({ extensionId }, 'No previous version for comparison');
      return;
    }

    const [newVersion, oldVersion] = versions;

    // Run differential analysis
    logger.info({ extensionId, oldVersion: oldVersion.version, newVersion: newVersion.version }, 'Triggering differential analysis');

    const analysis = await differentialAnalyzer.analyzeVersionDiff(
      extensionId,
      oldVersion.id,
      newVersion.id
    );

    if (!analysis) {
      logger.warn({ extensionId }, 'Differential analysis failed');
      return;
    }

    // If high/critical severity, create supply chain event and alert users
    if (analysis.severity === 'high' || analysis.severity === 'critical') {
      await prisma.supplyChainEvent.create({
        data: {
          extension_version_id: newVersion.id,
          extension_id: extensionId,
          event_type: 'permission_added',
          severity: analysis.severity,
          description: analysis.summary,
          metadata: {
            riskDelta: analysis.riskDelta,
            permissionsAdded: analysis.permissionsAdded,
          },
          detected_at: new Date(),
        },
      });

      // Alert users monitoring this extension
      await this.alertMonitoringUsers(extensionId, analysis);
    }
  }

  /**
   * Alert users who are monitoring this extension
   */
  private async alertMonitoringUsers(extensionId: string, analysis: any): Promise<void> {
    const monitoredBy = await prisma.monitoredExtension.findMany({
      where: {
        extension_id: extensionId,
        alert_on_update: true,
      },
    });

    for (const monitored of monitoredBy) {
      // Send alert via WebSocket
      wsManager.sendToUser(monitored.user_id, {
        type: 'alert',
        extensionId,
        severity: analysis.severity,
        message: `Extension updated with suspicious changes: ${analysis.summary}`,
        actionRequired: true,
        timestamp: Date.now(),
      });
    }

    logger.info({ extensionId, userCount: monitoredBy.length }, 'Alerts sent to monitoring users');
  }

  /**
   * Scrape multiple extensions in batch
   */
  async scrapeBatch(extensionIds: string[]): Promise<void> {
    logger.info({ count: extensionIds.length }, 'Starting batch scrape');

    for (const extensionId of extensionIds) {
      try {
        await this.scrapeExtension(extensionId);
        // Rate limiting: wait 2 seconds between requests
        await this.sleep(2000);
      } catch (error) {
        logger.error({ error, extensionId }, 'Batch scrape item failed');
      }
    }

    logger.info({ count: extensionIds.length }, 'Batch scrape completed');
  }

  /**
   * Scrape all monitored extensions
   */
  async scrapeMonitoredExtensions(): Promise<void> {
    const monitored = await prisma.monitoredExtension.findMany({
      where: { auto_scan: true },
      select: { extension_id: true },
      distinct: ['extension_id'],
    });

    const extensionIds = monitored.map(m => m.extension_id);

    logger.info({ count: extensionIds.length }, 'Scraping monitored extensions');

    await this.scrapeBatch(extensionIds);
  }

  /**
   * Scrape extensions that need update (>24 hours since last scrape)
   */
  async scrapeStaleExtensions(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stale = await prisma.cWSMetadata.findMany({
      where: {
        last_scraped_at: { lt: oneDayAgo },
        delisted: false,
      },
      select: { extension_id: true },
      take: 100, // Limit to 100 per run
    });

    const extensionIds = stale.map(m => m.extension_id);

    logger.info({ count: extensionIds.length }, 'Scraping stale extensions');

    await this.scrapeBatch(extensionIds);
  }

  /**
   * Mock scraper for development
   * TODO: Replace with real Playwright implementation
   */
  private async mockScrape(extensionId: string): Promise<CWSExtensionInfo | null> {
    // Simulate network delay
    await this.sleep(500);

    // Return mock data
    return {
      id: extensionId,
      name: `Extension ${extensionId.slice(0, 8)}`,
      version: '1.0.0',
      description: 'A sample extension',
      author: 'Developer Name',
      author_email: 'dev@example.com',
      category: 'Productivity',
      rating: 4.5,
      rating_count: 1234,
      user_count: 50000,
      homepage_url: 'https://example.com',
      support_url: 'https://example.com/support',
      privacy_policy_url: 'https://example.com/privacy',
      featured: false,
      last_updated: new Date(),
      manifest: {
        manifest_version: 3,
        name: `Extension ${extensionId.slice(0, 8)}`,
        version: '1.0.0',
      },
      permissions: ['storage', 'tabs'],
      host_permissions: [],
    };
  }

  /**
   * Helper: Sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get scrape statistics
   */
  async getStats(): Promise<any> {
    const [totalExtensions, scrapedToday, staleExtensions] = await Promise.all([
      prisma.cWSMetadata.count(),
      prisma.cWSMetadata.count({
        where: {
          last_scraped_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.cWSMetadata.count({
        where: {
          last_scraped_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          delisted: false,
        },
      }),
    ]);

    return {
      totalExtensions,
      scrapedToday,
      staleExtensions,
      inProgress: this.scrapeInProgress.size,
    };
  }
}

export const cwsScraper = new CWSScraperService();
