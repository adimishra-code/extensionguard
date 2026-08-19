import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../utils/auth-middleware';
import { networkMonitor } from '../services/network-monitor';
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
