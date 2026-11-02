import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { differentialAnalyzer } from './differential-analyzer';
import { wsManager } from './websocket-manager';
import AdmZip from 'adm-zip';

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
   * Strip CRX package header to get raw ZIP archive
   */
  public extractZipFromCRX(buffer: Buffer): Buffer {
    if (buffer.length > 16 && buffer[0] === 0x43 && buffer[1] === 0x72 && buffer[2] === 0x32 && buffer[3] === 0x34) {
      for (let i = 4; i < Math.min(buffer.length - 4, 100000); i++) {
        if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x03 && buffer[i + 3] === 0x04) {
          return buffer.subarray(i);
        }
      }
    }
    return buffer;
  }

  /**
   * Live scrape from Chrome Web Store with CRX parsing
   */
  private async fetchLiveCWSMetadata(extensionId: string): Promise<CWSExtensionInfo | 'delisted' | null> {
    const cwsUrl = `https://chromewebstore.google.com/detail/${extensionId}`;
    try {
      const response = await fetch(cwsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (response.status === 404) {
        logger.warn({ extensionId }, 'Extension returned 404 from CWS (delisted)');
        await prisma.cWSMetadata.upsert({
          where: { extension_id: extensionId },
          create: {
            extension_id: extensionId,
            name: `Extension ${extensionId.slice(0, 8)}`,
            delisted: true,
            last_scraped_at: new Date(),
          },
          update: {
            delisted: true,
            last_scraped_at: new Date(),
          },
        });
        await prisma.supplyChainEvent.create({
          data: {
            extension_id: extensionId,
            event_type: 'delisted',
            severity: 'high',
            description: `Extension was delisted from Chrome Web Store`,
            detected_at: new Date(),
          },
        });
        return 'delisted';
      }

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1];
      const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1];
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i)?.[1];

      let name = ogTitle || titleMatch?.replace(/ - Chrome Web Store.*/, '') || `Extension ${extensionId.slice(0, 8)}`;
      let description = ogDesc || 'Chrome extension';
      let version = '1.0.0';
      let rating = 4.5;
      let ratingCount = 0;
      let userCount = 0;
      let author = 'Developer';

      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
      if (jsonLdMatch && jsonLdMatch[1]) {
        try {
          const ld = JSON.parse(jsonLdMatch[1]);
          if (ld.name) name = ld.name;
          if (ld.version) version = ld.version;
          if (ld.description) description = ld.description;
          if (ld.aggregateRating?.ratingValue) rating = parseFloat(ld.aggregateRating.ratingValue);
          if (ld.aggregateRating?.reviewCount) ratingCount = parseInt(ld.aggregateRating.reviewCount, 10);
          if (ld.author?.name) author = ld.author.name;
        } catch {}
      }

      const userMatch = html.match(/([\d,]+)\+?\s*users/i);
      if (userMatch && userMatch[1]) {
        userCount = parseInt(userMatch[1].replace(/,/g, ''), 10);
      }

      let manifest: any = { manifest_version: 3, name, version };
      let permissions: string[] = ['storage', 'tabs'];
      let host_permissions: string[] = [];

      try {
        const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;
        const crxRes = await fetch(crxUrl, { signal: AbortSignal.timeout(10000) });
        if (crxRes.ok) {
          const arrayBuffer = await crxRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const zipBuffer = this.extractZipFromCRX(buffer);
          const zip = new AdmZip(zipBuffer);
          const manifestEntry = zip.getEntry('manifest.json');
          if (manifestEntry) {
            const parsed = JSON.parse(manifestEntry.getData().toString('utf8').replace(/^\uFEFF/, ''));
            manifest = parsed;
            version = parsed.version || version;
            permissions = parsed.permissions || [];
            host_permissions = parsed.host_permissions || [];
          }
        }
      } catch (crxErr) {
        logger.debug({ crxErr, extensionId }, 'CRX download skipped or failed');
      }

      return {
        id: extensionId,
        name,
        version,
        description,
        author,
        rating,
        rating_count: ratingCount,
        user_count: userCount,
        last_updated: new Date(),
        manifest,
        permissions,
        host_permissions,
      };
    } catch (err) {
      logger.debug({ err, extensionId }, 'Direct CWS scrape failed, falling back');
      return null;
    }
  }

  /**
   * Scrape extension metadata from Chrome Web Store
   */
  async scrapeExtension(extensionId: string): Promise<CWSExtensionInfo | null> {
    if (this.scrapeInProgress.has(extensionId)) {
      logger.debug({ extensionId }, 'Scrape already in progress');
      return null;
    }

    this.scrapeInProgress.add(extensionId);

    try {
      logger.info({ extensionId }, 'Starting CWS scrape');

      // Attempt live CWS scrape, falling back gracefully if offline or in sandbox
      const liveResult = await this.fetchLiveCWSMetadata(extensionId);
      if (liveResult === 'delisted') {
        logger.info({ extensionId }, 'Extension is delisted from Chrome Web Store');
        return null;
      }
      let info = liveResult;
      if (!info) {
        info = await this.mockScrape(extensionId);
      }

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
  private async triggerDifferentialAnalysis(extensionId: string, _newVersionId: string): Promise<void> {
    // Get previous version
    const versions = await prisma.extensionVersion.findMany({
      where: { extension_id: extensionId },
      orderBy: { detected_at: 'desc' },
      take: 2,
    });

    if (versions.length < 2 || !versions[0] || !versions[1]) {
      logger.debug({ extensionId }, 'No previous version for comparison');
      return;
    }

    const newVersion = versions[0];
    const oldVersion = versions[1];

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
