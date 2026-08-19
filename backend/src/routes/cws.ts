import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate, authenticateJWT } from '../utils/auth-middleware';
import { cwsScraper } from '../services/cws-scraper';
import { logger } from '../utils/logger';

const scrapeRequestSchema = z.object({
  extensionId: z.string(),
});

const batchScrapeSchema = z.object({
  extensionIds: z.array(z.string()).min(1).max(50),
});

export async function cwsRoutes(fastify: FastifyInstance) {
  /**
   * Trigger scrape for a specific extension
   */
  fastify.post('/api/cws/scrape', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const body = scrapeRequestSchema.parse(request.body);

      // Start scrape in background
      cwsScraper.scrapeExtension(body.extensionId).catch(error => {
        logger.error({ error, extensionId: body.extensionId }, 'Background scrape failed');
      });

      return reply.send({
        message: 'Scrape started',
        extensionId: body.extensionId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Batch scrape multiple extensions
   */
  fastify.post('/api/cws/scrape/batch', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const body = batchScrapeSchema.parse(request.body);

      // Start batch scrape in background
      cwsScraper.scrapeBatch(body.extensionIds).catch(error => {
        logger.error({ error }, 'Batch scrape failed');
      });

      return reply.send({
        message: 'Batch scrape started',
        count: body.extensionIds.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Get CWS metadata for an extension
   */
  fastify.get('/api/cws/metadata/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };

    const metadata = await prisma.cWSMetadata.findUnique({
      where: { extension_id: extensionId },
    });

    if (!metadata) {
      return reply.code(404).send({ error: 'Extension not found in cache' });
    }

    return reply.send({ metadata });
  });

  /**
   * Get version history for an extension
   */
  fastify.get('/api/cws/versions/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };
    const limit = parseInt((request.query as any).limit || '20', 10);

    const versions = await prisma.extensionVersion.findMany({
      where: { extension_id: extensionId },
      orderBy: { detected_at: 'desc' },
      take: limit,
      include: {
        supply_chain_events: {
          orderBy: { detected_at: 'desc' },
        },
      },
    });

    return reply.send({
      extensionId,
      versions,
      count: versions.length,
    });
  });

  /**
   * Get supply chain events for an extension
   */
  fastify.get('/api/cws/events/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };
    const limit = parseInt((request.query as any).limit || '50', 10);

    const events = await prisma.supplyChainEvent.findMany({
      where: { extension_id: extensionId },
      orderBy: { detected_at: 'desc' },
      take: limit,
      include: {
        extension_version: {
          select: {
            version: true,
            name: true,
          },
        },
      },
    });

    return reply.send({
      extensionId,
      events,
      count: events.length,
    });
  });

  /**
   * Get latest supply chain events (all extensions)
   */
  fastify.get('/api/cws/events', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const query = request.query as any;
    const limit = parseInt(query.limit || '50', 10);
    const severity = query.severity;

    const where = severity ? { severity } : {};

    const events = await prisma.supplyChainEvent.findMany({
      where,
      orderBy: { detected_at: 'desc' },
      take: limit,
      include: {
        extension_version: {
          select: {
            extension_id: true,
            version: true,
            name: true,
          },
        },
      },
    });

    return reply.send({
      events,
      count: events.length,
    });
  });

  /**
   * Get high-risk supply chain events
   */
  fastify.get('/api/cws/events/high-risk', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const limit = parseInt((request.query as any).limit || '20', 10);

    const events = await prisma.supplyChainEvent.findMany({
      where: {
        severity: { in: ['high', 'critical'] },
      },
      orderBy: { detected_at: 'desc' },
      take: limit,
      include: {
        extension_version: {
          select: {
            extension_id: true,
            version: true,
            name: true,
          },
        },
      },
    });

    return reply.send({
      events,
      count: events.length,
    });
  });

  /**
   * Get scraper statistics
   */
  fastify.get('/api/cws/stats', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const stats = await cwsScraper.getStats();

    return reply.send({ stats });
  });

  /**
   * Trigger scrape of all monitored extensions (admin/scheduled job)
   */
  fastify.post('/api/cws/scrape/monitored', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    // Start scrape in background
    cwsScraper.scrapeMonitoredExtensions().catch(error => {
      logger.error({ error }, 'Monitored extensions scrape failed');
    });

    return reply.send({
      message: 'Monitored extensions scrape started',
    });
  });

  /**
   * Trigger scrape of stale extensions (admin/scheduled job)
   */
  fastify.post('/api/cws/scrape/stale', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    // Start scrape in background
    cwsScraper.scrapeStaleExtensions().catch(error => {
      logger.error({ error }, 'Stale extensions scrape failed');
    });

    return reply.send({
      message: 'Stale extensions scrape started',
    });
  });

  /**
   * Search extensions by name
   */
  fastify.get('/api/cws/search', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const query = (request.query as any).q || '';
    const limit = parseInt((request.query as any).limit || '20', 10);

    const results = await prisma.cWSMetadata.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: limit,
      orderBy: { user_count: 'desc' },
    });

    return reply.send({
      query,
      results,
      count: results.length,
    });
  });

  logger.info('CWS routes registered');
}
