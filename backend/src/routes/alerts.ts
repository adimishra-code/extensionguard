import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateJWT } from '../utils/auth-middleware';
import { alertManager } from '../services/alert-manager';
import { logger } from '../utils/logger';

const sendAlertSchema = z.object({
  extensionId: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  message: z.string(),
  actionRequired: z.boolean().optional().default(false),
});

export async function alertRoutes(fastify: FastifyInstance) {
  /**
   * Get user's alerts
   */
  fastify.get('/api/alerts', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const query = request.query as any;
    const limit = parseInt(query.limit || '50', 10);
    const unreadOnly = query.unreadOnly === 'true';

    const alerts = await alertManager.getUserAlerts(userId, limit, unreadOnly);

    return reply.send({
      alerts,
      count: alerts.length,
    });
  });

  /**
   * Get alert statistics
   */
  fastify.get('/api/alerts/stats', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const stats = await alertManager.getAlertStats(userId);

    return reply.send({ stats });
  });

  /**
   * Mark alert as read
   */
  fastify.post('/api/alerts/:alertId/read', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { alertId } = request.params as { alertId: string };

    await alertManager.markAlertRead(alertId);

    return reply.send({ success: true });
  });

  /**
   * Mark all alerts as read
   */
  fastify.post('/api/alerts/read-all', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const userId = request.user!.userId;

    await alertManager.markAllRead(userId);

    return reply.send({ success: true });
  });

  /**
   * Delete alert
   */
  fastify.delete('/api/alerts/:alertId', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { alertId } = request.params as { alertId: string };

    await alertManager.deleteAlert(alertId);

    return reply.send({ success: true });
  });

  /**
   * Send manual alert (admin/testing)
   */
  fastify.post('/api/alerts/send', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const body = sendAlertSchema.parse(request.body);
      const userId = request.user!.userId;

      await alertManager.sendUserAlert(userId, body.extensionId, {
        severity: body.severity,
        title: body.title,
        message: body.message,
        actionRequired: body.actionRequired,
      });

      return reply.send({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  logger.info('Alert routes registered');
}
