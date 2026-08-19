import { FastifyPluginAsync } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { AuthService } from '../utils/auth';
import { prisma } from '../utils/prisma';
import { wsManager, MonitoringEvent } from '../services/websocket-manager';
import { monitorProcessor } from '../services/monitor-processor';

export const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  // Register WebSocket plugin
  await fastify.register(fastifyWebsocket);

  /**
   * WebSocket endpoint for real-time monitoring
   * Authenticate via query param: ?token=JWT_TOKEN or ?apiKey=API_KEY
   */
  fastify.get('/monitor', { websocket: true }, async (connection, request) => {
    const ws = connection.socket;

    try {
      // Authenticate
      const token = request.query.token as string | undefined;
      const apiKey = request.query.apiKey as string | undefined;

      let userId: string;
      let userEmail: string;

      if (token) {
        // Authenticate via JWT
        const payload = AuthService.verifyToken(token);
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, email: true },
        });

        if (!user) {
          ws.close(1008, 'User not found');
          return;
        }

        userId = user.id;
        userEmail = user.email;
      } else if (apiKey) {
        // Authenticate via API key
        const user = await prisma.user.findUnique({
          where: { api_key: apiKey },
          select: { id: true, email: true },
        });

        if (!user) {
          ws.close(1008, 'Invalid API key');
          return;
        }

        userId = user.id;
        userEmail = user.email;

        // Update last login
        await prisma.user.update({
          where: { id: userId },
          data: { last_login_at: new Date() },
        });
      } else {
        ws.close(1008, 'Authentication required');
        return;
      }

      // Generate client ID (will be overridden by client's clientId if provided)
      let clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const userAgent = request.headers['user-agent'] || 'Unknown';

      logger.info({ userId, userEmail, clientId }, 'WebSocket connection established');

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message: MonitoringEvent = JSON.parse(data.toString());

          // If this is a register event, use client's clientId
          if (message.type === 'register' && message.clientId) {
            // Check if client already registered
            const existingClient = wsManager.getClient(clientId);
            if (existingClient) {
              await wsManager.unregisterClient(clientId);
            }

            clientId = message.clientId;
            await wsManager.registerClient(ws, userId, clientId, userAgent);
          }

          // Process the event
          await monitorProcessor.processEvent(userId, clientId, message);
        } catch (error) {
          logger.error({ error, userId }, 'Failed to process WebSocket message');
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message',
            timestamp: Date.now(),
          }));
        }
      });

      // Handle connection close
      ws.on('close', async () => {
        logger.info({ userId, clientId }, 'WebSocket connection closed');
        await wsManager.unregisterClient(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error({ error, userId, clientId }, 'WebSocket error');
      });

      // Register client (initial registration before first message)
      await wsManager.registerClient(ws, userId, clientId, userAgent);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Extension Guard monitoring service',
        timestamp: Date.now(),
      }));

    } catch (error) {
      logger.error({ error }, 'WebSocket authentication failed');
      ws.close(1008, 'Authentication failed');
    }
  });

  /**
   * HTTP endpoint to get WebSocket connection stats
   */
  fastify.get('/api/monitor/stats', async (request, reply) => {
    const totalClients = wsManager.getClientCount();

    return reply.send({
      status: 'ok',
      connections: {
        total: totalClients,
      },
      timestamp: new Date().toISOString(),
    });
  });

  logger.info('WebSocket plugin registered');
};
