import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate } from '../utils/auth-middleware';
import { wsManager, ServerMessage } from '../services/websocket-manager';

const scanRequestSchema = z.object({
  extensionId: z.string(),
});

export async function monitorRoutes(fastify: FastifyInstance) {
  /**
   * Request a scan for a specific extension
   */
  fastify.post('/api/monitor/scan', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const body = scanRequestSchema.parse(request.body);
      const userId = request.user!.userId;

      // TODO: Queue scan job (integrate with existing scan queue)
      // For now, just acknowledge the request

      logger.info({ userId, extensionId: body.extensionId }, 'Scan requested via monitor API');

      return reply.send({
        message: 'Scan request received',
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
   * Get monitoring events for current user
   */
  fastify.get('/api/monitor/events', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const userId = request.user!.userId;

    // Get user's sessions
    const sessions = await prisma.monitorSession.findMany({
      where: { user_id: userId },
      select: { client_id: true },
      orderBy: { connected_at: 'desc' },
      take: 10,
    });

    const sessionIds = sessions.map(s => s.client_id);

    // Get recent events for these sessions
    const events = await prisma.monitoringEvent.findMany({
      where: { session_id: { in: sessionIds } },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    return reply.send({
      events,
      count: events.length,
    });
  });

  /**
   * Get active monitor sessions for current user
   */
  fastify.get('/api/monitor/sessions', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const userId = request.user!.userId;

    const sessions = await prisma.monitorSession.findMany({
      where: {
        user_id: userId,
        disconnected_at: null, // Only active sessions
      },
      orderBy: { connected_at: 'desc' },
    });

    // Get live connection info
    const sessionsWithStatus = sessions.map(session => ({
      ...session,
      isConnected: wsManager.getClient(session.client_id) !== undefined,
    }));

    return reply.send({
      sessions: sessionsWithStatus,
      count: sessionsWithStatus.length,
    });
  });

  /**
   * Send a test alert to user's connected clients
   */
  fastify.post('/api/monitor/test-alert', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const userId = request.user!.userId;

    const message: ServerMessage = {
      type: 'alert',
      severity: 'low',
      message: 'This is a test alert from Extension Guard',
      actionRequired: false,
      timestamp: Date.now(),
    };

    wsManager.sendToUser(userId, message);

    const clientCount = wsManager.getUserClientCount(userId);

    return reply.send({
      message: 'Test alert sent',
      clientsSent: clientCount,
    });
  });

  /**
   * Get monitored extensions for current user
   */
  fastify.get('/api/monitor/extensions', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const userId = request.user!.userId;

    const monitored = await prisma.monitoredExtension.findMany({
      where: { user_id: userId },
      orderBy: { last_checked_at: 'desc' },
    });

    return reply.send({
      extensions: monitored,
      count: monitored.length,
    });
  });

  /**
   * Add extension to monitoring list
   */
  fastify.post('/api/monitor/extensions', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const body = z.object({
        extensionId: z.string(),
        extensionName: z.string(),
        currentVersion: z.string(),
        autoScan: z.boolean().optional().default(true),
        alertOnUpdate: z.boolean().optional().default(true),
      }).parse(request.body);

      const userId = request.user!.userId;

      const monitored = await prisma.monitoredExtension.upsert({
        where: {
          user_id_extension_id: {
            user_id: userId,
            extension_id: body.extensionId,
          },
        },
        create: {
          user_id: userId,
          extension_id: body.extensionId,
          extension_name: body.extensionName,
          current_version: body.currentVersion,
          auto_scan: body.autoScan,
          alert_on_update: body.alertOnUpdate,
        },
        update: {
          current_version: body.currentVersion,
          auto_scan: body.autoScan,
          alert_on_update: body.alertOnUpdate,
          last_checked_at: new Date(),
        },
      });

      return reply.code(201).send({
        message: 'Extension added to monitoring',
        extension: monitored,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });
}

// Import logger
import { logger } from '../utils/logger';
