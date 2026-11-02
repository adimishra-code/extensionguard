import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../utils/auth-middleware';
import { networkMonitor } from '../services/network-monitor';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

const logNetworkSchema = z.object({
  extensionId: z.string(),
  url: z.string().url(),
  method: z.string(),
  requestHeaders: z.record(z.string()).optional(),
  responseHeaders: z.record(z.string()).optional(),
  statusCode: z.number().optional(),
  blocked: z.boolean().optional(),
});

export async function networkRoutes(fastify: FastifyInstance) {
  /**
   * Log network request from extension
   */
  fastify.post('/api/network/log', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const body = logNetworkSchema.parse(request.body);

      await networkMonitor.logRequest({
        extensionId: body.extensionId,
        url: body.url,
        method: body.method,
        requestHeaders: body.requestHeaders,
        responseHeaders: body.responseHeaders,
        statusCode: body.statusCode,
        blocked: body.blocked,
        timestamp: new Date(),
      });

      return reply.send({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Get all network logs (supports query filters for extensionId and blocked)
   */
  fastify.get('/api/network/logs', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const query = request.query as any;
    const limit = parseInt(query.limit || '100', 10);
    const offset = parseInt(query.offset || '0', 10);
    const where: any = {};
    if (query.extensionId) where.extension_id = query.extensionId;
    if (query.blocked !== undefined) where.blocked = query.blocked === 'true';

    const [logs, total] = await Promise.all([
      prisma.networkLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.networkLog.count({ where }),
    ]);

    return reply.send({
      logs,
      total,
      count: logs.length,
    });
  });

  /**
   * Get overall network stats or stats for an extension
   */
  fastify.get('/api/network/stats', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const query = request.query as any;
    const extensionId = query.extensionId as string | undefined;

    if (extensionId) {
      const stats = await networkMonitor.getExtensionNetworkStats(extensionId);
      return reply.send(stats);
    }

    const [totalRequests, blockedRequests, suspiciousCount] = await Promise.all([
      prisma.networkLog.count(),
      prisma.networkLog.count({ where: { blocked: true } }),
      prisma.networkLog.count({ where: { blocked: true } }),
    ]);

    const topDomainsRaw = await prisma.networkLog.groupBy({
      by: ['url'],
      _count: { url: true },
      take: 10,
      orderBy: { _count: { url: 'desc' } },
    });

    const topDomains = topDomainsRaw.map((item: { url: string; _count: { url: number } }) => {
      let domain = item.url;
      try {
        domain = new URL(item.url).hostname;
      } catch {}
      return { domain, count: item._count.url };
    });

    return reply.send({
      totalRequests,
      blockedRequests,
      suspiciousCount,
      topDomains,
    });
  });

  /**
   * Get network activity for an extension
   */
  fastify.get('/api/network/activity/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };
    const limit = parseInt((request.query as any).limit || '100', 10);

    const activity = await networkMonitor.getExtensionActivity(extensionId, limit);

    return reply.send({
      extensionId,
      activity,
      count: activity.length,
    });
  });

  /**
   * Get network stats for an extension
   */
  fastify.get('/api/network/stats/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };

    const stats = await networkMonitor.getExtensionNetworkStats(extensionId);

    return reply.send({
      extensionId,
      stats,
    });
  });

  /**
   * Analyze network patterns for anomalies
   */
  fastify.get('/api/network/analyze/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };

    const analysis = await networkMonitor.analyzeNetworkPatterns(extensionId);

    return reply.send({
      extensionId,
      analysis,
    });
  });

  /**
   * Get suspicious network activity (all extensions)
   */
  fastify.get('/api/network/suspicious', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const limit = parseInt((request.query as any).limit || '50', 10);

    const activity = await networkMonitor.getSuspiciousActivity(limit);

    return reply.send({
      activity,
      count: activity.length,
    });
  });

  logger.info('Network monitoring routes registered');
}
