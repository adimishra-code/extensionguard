import type { Config, MonitoringEvent, ServerMessage, Extension } from '@/types';
import { DEFAULT_CONFIG } from '@/constants';
import { WebSocketManager } from './websocket';
import { StorageManager } from './storage';

class BackgroundService {
  private ws: WebSocketManager;
  private storage: StorageManager;
  private clientId: string;

  constructor() {
    this.clientId = this.generateClientId();
    this.storage = new StorageManager();
    this.ws = new WebSocketManager(this.clientId);
    this.init();
  }

  private async init() {
    console.log('[Extension Guard] Background service starting...');

    // Load config
    const config = await this.storage.getConfig();

    // Set up listeners
    this.setupExtensionListeners();
    this.setupAlarmListeners();
    this.setupMessageListeners();

    // Initial sync
    await this.syncExtensions();

    // Connect to backend
    if (config.syncEnabled) {
      await this.ws.connect(config);
    }

    console.log('[Extension Guard] Background service initialized');
  }

  private setupExtensionListeners() {
    // Extension installed
    chrome.management.onInstalled.addListener(async (info) => {
      console.log('[Extension Guard] Extension installed:', info.name);

      const extension = await this.getExtensionDetails(info.id);
      await this.handleExtensionInstalled(extension);
    });

    // Extension uninstalled
    chrome.management.onUninstalled.addListener(async (id) => {
      console.log('[Extension Guard] Extension uninstalled:', id);

      const event: MonitoringEvent = {
        type: 'extension_removed',
        extensionId: id,
        timestamp: Date.now(),
      };

      this.ws.send(event);
      await this.storage.removeRiskScore(id);
    });

    // Extension enabled/disabled
    chrome.management.onEnabled.addListener(async (info) => {
      console.log('[Extension Guard] Extension enabled:', info.name);

      const event: MonitoringEvent = {
        type: 'extension_enabled',
        extensionId: info.id,
        timestamp: Date.now(),
      };

      this.ws.send(event);
    });

    chrome.management.onDisabled.addListener(async (info) => {
      console.log('[Extension Guard] Extension disabled:', info.name);

      const event: MonitoringEvent = {
        type: 'extension_disabled',
        extensionId: info.id,
        timestamp: Date.now(),
      };

      this.ws.send(event);
    });
  }

  private setupAlarmListeners() {
    // Periodic sync
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'sync-extensions') {
        await this.syncExtensions();
      } else if (alarm.name === 'heartbeat') {
        this.ws.sendHeartbeat();
      }
    });

    // Create alarms
    chrome.alarms.create('sync-extensions', { periodInMinutes: 60 });
    chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
  }

  private setupMessageListeners() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message).then(sendResponse);
      return true; // Async response
    });

    // Listen for WebSocket messages
    this.ws.on('message', async (message: ServerMessage) => {
      await this.handleServerMessage(message);
    });
  }

  private async handleMessage(message: any): Promise<any> {
    switch (message.type) {
      case 'get-extensions':
        return await this.getAllExtensions();

      case 'get-risk-scores':
        return await this.storage.getAllRiskScores();

      case 'get-alerts':
        return await this.storage.getAlerts();

      case 'disable-extension':
        await chrome.management.setEnabled(message.extensionId, false);
        return { success: true };

      case 'scan-extension':
        await this.requestScan(message.extensionId);
        return { success: true };

      case 'mark-alert-read':
        await this.storage.markAlertRead(message.alertId);
        return { success: true };

      case 'update-config':
        await this.storage.saveConfig(message.config);
        if (message.config.syncEnabled) {
          await this.ws.connect(message.config);
        } else {
          this.ws.disconnect();
        }
        return { success: true };

      default:
        return { error: 'Unknown message type' };
    }
  }

  private async handleServerMessage(message: ServerMessage) {
    switch (message.type) {
      case 'risk_update':
        if (message.extensionId && message.riskScore !== undefined) {
          await this.storage.saveRiskScore({
            extensionId: message.extensionId,
            score: message.riskScore,
            severity: message.severity || 'low',
            reasons: message.reasons || [],
            lastUpdated: message.timestamp,
          });

          // Update badge
          await this.updateBadge();

          // Show notification if critical
          if (message.severity === 'critical') {
            const extension = await chrome.management.get(message.extensionId);
            this.showNotification({
              title: 'Critical Security Alert',
              message: `${extension.name} has critical security issues`,
              iconUrl: 'icons/icon128.png',
            });
          }
        }
        break;

      case 'alert':
        if (message.extensionId && message.message) {
          const extension = await chrome.management.get(message.extensionId);

          await this.storage.addAlert({
            id: `alert-${Date.now()}`,
            extensionId: message.extensionId,
            extensionName: extension.name,
            severity: message.severity || 'medium',
            message: message.message,
            timestamp: message.timestamp,
            read: false,
            actionRequired: message.actionRequired || false,
          });

          // Show notification
          if (message.severity === 'high' || message.severity === 'critical') {
            this.showNotification({
              title: 'Extension Guard Alert',
              message: `${extension.name}: ${message.message}`,
              iconUrl: 'icons/icon128.png',
            });
          }

          // Update badge
          await this.updateBadge();
        }
        break;

      case 'scan_complete':
        // Notify user that scan completed
        console.log('[Extension Guard] Scan completed:', message.scanId);
        break;

      case 'pong':
        // Heartbeat response
        break;
    }
  }

  private async syncExtensions() {
    console.log('[Extension Guard] Syncing extensions...');

    const extensions = await this.getAllExtensions();

    const event: MonitoringEvent = {
      type: 'register',
      clientId: this.clientId,
      userAgent: navigator.userAgent,
      extensions,
      timestamp: Date.now(),
    };

    this.ws.send(event);
  }

  private async getAllExtensions(): Promise<Extension[]> {
    const extensions = await chrome.management.getAll();

    return extensions
      .filter(ext => ext.id !== chrome.runtime.id) // Exclude ourselves
      .map(ext => ({
        id: ext.id,
        name: ext.name,
        version: ext.version,
        description: ext.description,
        enabled: ext.enabled,
        permissions: ext.permissions || [],
        hostPermissions: ext.hostPermissions || [],
        installType: ext.installType,
        updateUrl: ext.updateUrl,
        homepageUrl: ext.homepageUrl,
        icons: ext.icons?.map(icon => ({ size: icon.size, url: icon.url })),
      }));
  }

  private async getExtensionDetails(id: string): Promise<Extension> {
    const ext = await chrome.management.get(id);

    return {
      id: ext.id,
      name: ext.name,
      version: ext.version,
      description: ext.description,
      enabled: ext.enabled,
      permissions: ext.permissions || [],
      hostPermissions: ext.hostPermissions || [],
      installType: ext.installType,
      updateUrl: ext.updateUrl,
      homepageUrl: ext.homepageUrl,
      icons: ext.icons?.map(icon => ({ size: icon.size, url: icon.url })),
    };
  }

  private async handleExtensionInstalled(extension: Extension) {
    // Check if it's an update or new install
    const previousVersion = await this.storage.getExtensionVersion(extension.id);

    if (previousVersion && previousVersion !== extension.version) {
      // It's an update
      const event: MonitoringEvent = {
        type: 'extension_updated',
        extensionId: extension.id,
        oldVersion: previousVersion,
        newVersion: extension.version,
        timestamp: Date.now(),
      };

      this.ws.send(event);

      // Show notification
      this.showNotification({
        title: 'Extension Updated',
        message: `${extension.name} updated from ${previousVersion} to ${extension.version}`,
        iconUrl: 'icons/icon128.png',
      });
    } else {
      // New install
      const event: MonitoringEvent = {
        type: 'extension_installed',
        extensionId: extension.id,
        timestamp: Date.now(),
      };

      this.ws.send(event);
    }

    // Save current version
    await this.storage.saveExtensionVersion(extension.id, extension.version);
  }

  private async requestScan(extensionId: string) {
    // Request backend to scan extension
    const config = await this.storage.getConfig();

    if (!config.apiKey) {
      console.error('[Extension Guard] No API key configured');
      return;
    }

    // API call to trigger scan
    const response = await fetch(`${config.apiUrl}/api/monitor/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ extensionId }),
    });

    if (response.ok) {
      this.showNotification({
        title: 'Scan Requested',
        message: 'Extension scan started. You will be notified when complete.',
        iconUrl: 'icons/icon128.png',
      });
    }
  }

  private async updateBadge() {
    const alerts = await this.storage.getAlerts();
    const unreadCount = alerts.filter(a => !a.read).length;

    if (unreadCount > 0) {
      await chrome.action.setBadgeText({ text: String(unreadCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // red
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  }

  private showNotification(options: { title: string; message: string; iconUrl: string }) {
    chrome.notifications.create({
      type: 'basic',
      ...options,
    });
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Initialize background service
new BackgroundService();

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('[Extension Guard] Extension startup');
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Extension Guard] Extension installed/updated:', details.reason);
});
