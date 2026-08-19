import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { wsManager, MonitoringEvent, ServerMessage } from './websocket-manager';

export class MonitorProcessor {
  /**
   * Process incoming monitoring event from extension
   */
  async processEvent(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    logger.debug({ userId, clientId, eventType: event.type }, 'Processing monitoring event');

    try {
      switch (event.type) {
        case 'register':
          await this.handleRegister(userId, clientId, event);
          break;

        case 'extension_installed':
          await this.handleExtensionInstalled(userId, clientId, event);
          break;

        case 'extension_updated':
          await this.handleExtensionUpdated(userId, clientId, event);
          break;

        case 'extension_removed':
          await this.handleExtensionRemoved(userId, clientId, event);
          break;

        case 'extension_enabled':
          await this.handleExtensionEnabled(userId, clientId, event);
          break;

        case 'extension_disabled':
          await this.handleExtensionDisabled(userId, clientId, event);
          break;

        case 'network_request':
          await this.handleNetworkRequest(userId, clientId, event);
          break;

        case 'ping':
          await this.handlePing(userId, clientId, event);
          break;

        default:
          logger.warn({ eventType: event.type }, 'Unknown event type');
      }
    } catch (error) {
      logger.error({ error, userId, clientId, eventType: event.type }, 'Failed to process event');
    }
  }

  /**
   * Handle initial registration with extension list
   */
  private async handleRegister(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    logger.info({ userId, clientId, extensionCount: event.extensions?.length }, 'Client registered with extensions');

    // Store monitoring event
    if (event.extensions) {
      for (const ext of event.extensions) {
        await this.storeMonitoringEvent(clientId, ext.id, 'register', { extension: ext });

        // Check if extension needs scanning
        await this.checkAndQueueScan(userId, clientId, ext.id, ext.version);
      }
    }
  }

  /**
   * Handle new extension installation
   */
  private async handleExtensionInstalled(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    if (!event.extensionId) return;

    logger.info({ userId, clientId, extensionId: event.extensionId }, 'Extension installed');

    await this.storeMonitoringEvent(clientId, event.extensionId, 'extension_installed', event);

    // Check threat intelligence
    const threats = await this.checkThreatIntelligence(event.extensionId);

    if (threats.length > 0) {
      // Send critical alert
      const message: ServerMessage = {
        type: 'alert',
        extensionId: event.extensionId,
        severity: 'critical',
        message: `Known malicious extension detected: ${threats[0].description}`,
        actionRequired: true,
        timestamp: Date.now(),
      };

      wsManager.sendToClient(clientId, message);
    }

    // Queue scan
    await this.checkAndQueueScan(userId, clientId, event.extensionId);
  }

  /**
   * Handle extension update
   */
  private async handleExtensionUpdated(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    if (!event.extensionId || !event.newVersion) return;

    logger.info({
      userId,
      clientId,
      extensionId: event.extensionId,
      oldVersion: event.oldVersion,
      newVersion: event.newVersion
    }, 'Extension updated');

    await this.storeMonitoringEvent(clientId, event.extensionId, 'extension_updated', event);

    // Send notification
    const message: ServerMessage = {
      type: 'alert',
      extensionId: event.extensionId,
      severity: 'medium',
      message: `Extension updated from ${event.oldVersion} to ${event.newVersion}`,
      actionRequired: false,
      timestamp: Date.now(),
    };

    wsManager.sendToClient(clientId, message);

    // Queue differential analysis and scan
    await this.checkAndQueueScan(userId, clientId, event.extensionId, event.newVersion);
  }

  /**
   * Handle extension removal
   */
  private async handleExtensionRemoved(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    if (!event.extensionId) return;

    logger.info({ userId, clientId, extensionId: event.extensionId }, 'Extension removed');

    await this.storeMonitoringEvent(clientId, event.extensionId, 'extension_removed', event);
  }

  /**
   * Handle extension enabled
   */
  private async handleExtensionEnabled(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    if (!event.extensionId) return;

    await this.storeMonitoringEvent(clientId, event.extensionId, 'extension_enabled', event);
  }

  /**
   * Handle extension disabled
   */
  private async handleExtensionDisabled(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    if (!event.extensionId) return;

    await this.storeMonitoringEvent(clientId, event.extensionId, 'extension_disabled', event);
  }

  /**
   * Handle network request monitoring
   */
  private async handleNetworkRequest(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    if (!event.extensionId || !event.url) return;

    // Store event
    await this.storeMonitoringEvent(clientId, event.extensionId, 'network_request', event);

    // Check for suspicious domains
    const isSuspicious = await this.checkSuspiciousDomain(event.url);

    if (isSuspicious) {
      const message: ServerMessage = {
        type: 'alert',
        extensionId: event.extensionId,
        severity: 'high',
        message: `Extension contacted suspicious domain: ${new URL(event.url).hostname}`,
        actionRequired: true,
        timestamp: Date.now(),
      };

      wsManager.sendToClient(clientId, message);
    }
  }

  /**
   * Handle heartbeat/ping
   */
  private async handlePing(userId: string, clientId: string, event: MonitoringEvent): Promise<void> {
    // Update heartbeat
    await wsManager.updateHeartbeat(clientId);

    // Send pong
    const message: ServerMessage = {
      type: 'pong',
      timestamp: Date.now(),
    };

    wsManager.sendToClient(clientId, message);
  }

  /**
   * Store monitoring event in database
   */
  private async storeMonitoringEvent(
    sessionId: string,
    extensionId: string,
    eventType: string,
    data: any
  ): Promise<void> {
    try {
      await prisma.monitoringEvent.create({
        data: {
          session_id: sessionId,
          extension_id: extensionId,
          event_type: eventType,
          data: data,
        },
      });
    } catch (error) {
      logger.error({ error, sessionId, extensionId, eventType }, 'Failed to store monitoring event');
    }
  }

  /**
   * Check threat intelligence database
   */
  private async checkThreatIntelligence(extensionId: string): Promise<any[]> {
    return prisma.threatIntelligence.findMany({
      where: {
        extension_id: extensionId,
        active: true,
        severity: { in: ['high', 'critical'] },
      },
    });
  }

  /**
   * Check if domain is suspicious
   */
  private async checkSuspiciousDomain(url: string): Promise<boolean> {
    try {
      const domain = new URL(url).hostname;

      const threat = await prisma.threatIntelligence.findFirst({
        where: {
          domain,
          active: true,
          type: 'domain',
        },
      });

      return !!threat;
    } catch {
      return false;
    }
  }

  /**
   * Check if extension needs scanning and queue if needed
   */
  private async checkAndQueueScan(
    userId: string,
    clientId: string,
    extensionId: string,
    version?: string
  ): Promise<void> {
    // For now, just log - will integrate with scan queue later
    logger.debug({ userId, clientId, extensionId, version }, 'Would queue scan for extension');

    // TODO: Integrate with existing scan queue
    // - Check if we have this extension version scanned
    // - If not, queue a scan job
    // - When scan completes, send risk_update message
  }
}

export const monitorProcessor = new MonitorProcessor();
