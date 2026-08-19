import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

export interface MonitoringEvent {
  type: 'register' | 'extension_installed' | 'extension_updated' | 'extension_removed' | 'extension_enabled' | 'extension_disabled' | 'network_request' | 'ping';
  timestamp: number;
  clientId?: string;
  userAgent?: string;
  extensions?: any[];
  extensionId?: string;
  oldVersion?: string;
  newVersion?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface ServerMessage {
  type: 'risk_update' | 'alert' | 'scan_complete' | 'pong';
  extensionId?: string;
  riskScore?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  reasons?: string[];
  message?: string;
  actionRequired?: boolean;
  scanId?: string;
  reportUrl?: string;
  timestamp: number;
}

export interface ConnectedClient {
  userId: string;
  clientId: string;
  sessionId: string;
  ws: WebSocket;
  userAgent: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

class WebSocketManager {
  private clients: Map<string, ConnectedClient> = new Map();

  /**
   * Register a new WebSocket connection
   */
  async registerClient(
    ws: WebSocket,
    userId: string,
    clientId: string,
    userAgent: string
  ): Promise<string> {
    // Create monitor session in database
    const session = await prisma.monitorSession.create({
      data: {
        user_id: userId,
        client_id: clientId,
        user_agent: userAgent,
      },
    });

    // Store client
    this.clients.set(clientId, {
      userId,
      clientId,
      sessionId: session.id,
      ws,
      userAgent,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    });

    logger.info({ userId, clientId, sessionId: session.id }, 'WebSocket client registered');

    return session.id;
  }

  /**
   * Unregister a WebSocket connection
   */
  async unregisterClient(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);

    if (client) {
      // Update session in database
      await prisma.monitorSession.update({
        where: { id: client.sessionId },
        data: { disconnected_at: new Date() },
      });

      this.clients.delete(clientId);

      logger.info({ clientId, sessionId: client.sessionId }, 'WebSocket client unregistered');
    }
  }

  /**
   * Update heartbeat timestamp
   */
  async updateHeartbeat(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);

    if (client) {
      client.lastHeartbeat = new Date();

      // Update in database
      await prisma.monitorSession.update({
        where: { id: client.sessionId },
        data: { last_heartbeat: new Date() },
      });
    }
  }

  /**
   * Send message to a specific client
   */
  sendToClient(clientId: string, message: ServerMessage): void {
    const client = this.clients.get(clientId);

    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
      logger.debug({ clientId, messageType: message.type }, 'Sent message to client');
    }
  }

  /**
   * Send message to all clients for a specific user
   */
  sendToUser(userId: string, message: ServerMessage): void {
    let sentCount = 0;

    for (const client of this.clients.values()) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
        sentCount++;
      }
    }

    logger.debug({ userId, messageType: message.type, sentCount }, 'Sent message to user');
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: ServerMessage): void {
    let sentCount = 0;

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
        sentCount++;
      }
    }

    logger.debug({ messageType: message.type, sentCount }, 'Broadcast message to all clients');
  }

  /**
   * Get client by clientId
   */
  getClient(clientId: string): ConnectedClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients for a user
   */
  getUserClients(userId: string): ConnectedClient[] {
    return Array.from(this.clients.values()).filter(
      (client) => client.userId === userId
    );
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get connected client count for a user
   */
  getUserClientCount(userId: string): number {
    return this.getUserClients(userId).length;
  }

  /**
   * Clean up stale connections (heartbeat > 5 minutes old)
   */
  async cleanupStaleConnections(): Promise<void> {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const staleClients: string[] = [];

    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastHeartbeat.getTime() > staleThreshold) {
        staleClients.push(clientId);
      }
    }

    for (const clientId of staleClients) {
      const client = this.clients.get(clientId);
      if (client) {
        client.ws.close();
        await this.unregisterClient(clientId);
      }
    }

    if (staleClients.length > 0) {
      logger.info({ count: staleClients.length }, 'Cleaned up stale connections');
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();

// Start cleanup task (every 2 minutes)
setInterval(() => {
  wsManager.cleanupStaleConnections();
}, 2 * 60 * 1000);
