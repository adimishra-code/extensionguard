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
   * WebSocket connection handler for real-time monitoring
   * Authenticate via query param: ?token=JWT_TOKEN or ?apiKey=API_KEY
   */
  const handleWebSocketConnection = async (connection: WebSocket | { socket: WebSocket }, request: any) => {
    const ws = ('socket' in connection && connection.socket) ? connection.socket : (connection as WebSocket);

    try {
      const query = (request.query || {}) as Record<string, string | undefined>;
      const token = query.token;
      const apiKey = query.apiKey;

      let userId: string;
      let userEmail: string;

      if (token) {
        try {
          const payload = AuthService.verifyToken(token);
          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, email: true },
          });

          if (user) {
            userId = user.id;
            userEmail = user.email;
          } else {
            userId = payload.userId;
            userEmail = payload.email || 'user@extensionguard.io';
          }
        } catch {
          // If token verification fails in dev or live dashboard, allow guest viewer
          userId = 'dashboard-viewer';
          userEmail = 'viewer@extensionguard.io';
        }
      } else if (apiKey) {
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

        await prisma.user.update({
          where: { id: userId },
          data: { last_login_at: new Date() },
        });
      } else {
        // Allow unauthenticated dashboard monitoring connection
        userId = 'dashboard-viewer';
        userEmail = 'viewer@extensionguard.io';
      }

      let clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const userAgent = (request.headers['user-agent'] as string) || 'Unknown';

      logger.info({ userId, userEmail, clientId }, 'WebSocket connection established');

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message: MonitoringEvent = JSON.parse(data.toString());

          if (message.type === 'register' && message.clientId) {
            const existingClient = wsManager.getClient(clientId);
            if (existingClient) {
              await wsManager.unregisterClient(clientId);
            }

            clientId = message.clientId;
            await wsManager.registerClient(ws, userId, clientId, userAgent);
          }

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
      ws.on('error', (error: Error) => {
        logger.error({ error, userId, clientId }, 'WebSocket error');
      });

      // Register client
      await wsManager.registerClient(ws, userId, clientId, userAgent);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Extension Guard monitoring service',
        timestamp: Date.now(),
      }));

    } catch (error) {
      logger.error({ error }, 'WebSocket initialization failed');
      try {
        ws.close(1008, 'Initialization failed');
      } catch {}
    }
  };

  // Register on both /monitor and /ws
  fastify.get('/monitor', { websocket: true }, handleWebSocketConnection);
  fastify.get('/ws', { websocket: true }, handleWebSocketConnection);

  /**
   * HTTP endpoint to get WebSocket connection stats
   */
  fastify.get('/api/monitor/stats', async (_request, reply) => {
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
