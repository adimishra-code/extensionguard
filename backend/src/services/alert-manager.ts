import { wsManager } from './websocket-manager';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

interface AlertTemplate {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  actionRequired: boolean;
}

export class AlertManager {
  /**
   * Send alert to all users monitoring an extension
   */
  async sendExtensionAlert(
    extensionId: string,
    template: AlertTemplate
  ): Promise<void> {
    try {
      // Get users monitoring this extension
      const monitored = await prisma.monitoredExtension.findMany({
        where: {
          extension_id: extensionId,
          alert_on_update: true,
        },
        include: {
          user: true,
        },
      });

      // Send to each user
      for (const monitor of monitored) {
        await this.sendUserAlert(monitor.user_id, extensionId, template);
      }

      logger.info({
        extensionId,
        severity: template.severity,
        userCount: monitored.length,
      }, 'Extension alert sent');
    } catch (error) {
      logger.error({ error, extensionId }, 'Failed to send extension alert');
    }
  }

  /**
   * Send alert to specific user
   */
  async sendUserAlert(
    userId: string,
    extensionId: string,
    template: AlertTemplate
  ): Promise<void> {
    try {
      // Create alert record
      const alert = await prisma.alert.create({
        data: {
          user_id: userId,
          extension_id: extensionId,
          severity: template.severity,
          title: template.title,
          message: template.message,
          action_required: template.actionRequired,
          read: false,
        },
      });

      // Send via WebSocket
      wsManager.sendToUser(userId, {
        type: 'alert',
        extensionId,
        severity: template.severity,
        message: template.message,
        actionRequired: template.actionRequired,
        timestamp: Date.now(),
      });

      logger.info({
        userId,
        extensionId,
        severity: template.severity,
      }, 'User alert sent');
    } catch (error) {
      logger.error({ error, userId, extensionId }, 'Failed to send user alert');
    }
  }

  /**
   * Send critical security alert
   */
  async sendCriticalAlert(
    extensionId: string,
    reason: string
  ): Promise<void> {
    await this.sendExtensionAlert(extensionId, {
      severity: 'critical',
      title: 'Critical Security Alert',
      message: `DANGER: ${reason}. Disable this extension immediately!`,
      actionRequired: true,
    });
  }

  /**
   * Send supply chain attack alert
   */
  async sendSupplyChainAlert(
    extensionId: string,
    oldVersion: string,
    newVersion: string,
    changes: string[]
  ): Promise<void> {
    await this.sendExtensionAlert(extensionId, {
      severity: 'high',
      title: 'Suspicious Extension Update',
      message: `Version ${newVersion} adds dangerous permissions: ${changes.join(', ')}`,
      actionRequired: true,
    });
  }

  /**
   * Send malicious domain alert
   */
  async sendMaliciousDomainAlert(
    extensionId: string,
    domain: string
  ): Promise<void> {
    await this.sendExtensionAlert(extensionId, {
      severity: 'high',
      title: 'Malicious Domain Contacted',
      message: `Extension contacted known malicious domain: ${domain}`,
      actionRequired: true,
    });
  }

  /**
   * Send low-risk info alert
   */
  async sendInfoAlert(
    extensionId: string,
    message: string
  ): Promise<void> {
    await this.sendExtensionAlert(extensionId, {
      severity: 'low',
      title: 'Extension Update',
      message,
      actionRequired: false,
    });
  }

  /**
   * Get alerts for user
   */
  async getUserAlerts(
    userId: string,
    limit = 50,
    unreadOnly = false
  ): Promise<any[]> {
    const where: any = { user_id: userId };
    if (unreadOnly) {
      where.read = false;
    }

    return prisma.alert.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  /**
   * Mark alert as read
   */
  async markAlertRead(alertId: string): Promise<void> {
    await prisma.alert.update({
      where: { id: alertId },
      data: { read: true },
    });
  }

  /**
   * Mark all user alerts as read
   */
  async markAllRead(userId: string): Promise<void> {
    await prisma.alert.updateMany({
      where: {
        user_id: userId,
        read: false,
      },
      data: { read: true },
    });
  }

  /**
   * Delete alert
   */
  async deleteAlert(alertId: string): Promise<void> {
    await prisma.alert.delete({
      where: { id: alertId },
    });
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(userId: string): Promise<any> {
    const [total, unread, critical] = await Promise.all([
      prisma.alert.count({
        where: { user_id: userId },
      }),
      prisma.alert.count({
        where: {
          user_id: userId,
          read: false,
        },
      }),
      prisma.alert.count({
        where: {
          user_id: userId,
          severity: 'critical',
          read: false,
        },
      }),
    ]);

    return { total, unread, critical };
  }
}

export const alertManager = new AlertManager();
