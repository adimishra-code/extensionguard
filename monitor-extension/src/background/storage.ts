import type { Config, RiskScore, Alert } from '@/types';
import { DEFAULT_CONFIG } from '@/constants';

export class StorageManager {
  private readonly KEYS = {
    CONFIG: 'config',
    RISK_SCORES: 'riskScores',
    ALERTS: 'alerts',
    EXTENSION_VERSIONS: 'extensionVersions',
  };

  async getConfig(): Promise<Config> {
    const result = await chrome.storage.local.get(this.KEYS.CONFIG);
    return result[this.KEYS.CONFIG] || DEFAULT_CONFIG;
  }

  async saveConfig(config: Config): Promise<void> {
    await chrome.storage.local.set({ [this.KEYS.CONFIG]: config });
  }

  async getAllRiskScores(): Promise<Record<string, RiskScore>> {
    const result = await chrome.storage.local.get(this.KEYS.RISK_SCORES);
    return result[this.KEYS.RISK_SCORES] || {};
  }

  async saveRiskScore(riskScore: RiskScore): Promise<void> {
    const scores = await this.getAllRiskScores();
    scores[riskScore.extensionId] = riskScore;
    await chrome.storage.local.set({ [this.KEYS.RISK_SCORES]: scores });
  }

  async removeRiskScore(extensionId: string): Promise<void> {
    const scores = await this.getAllRiskScores();
    delete scores[extensionId];
    await chrome.storage.local.set({ [this.KEYS.RISK_SCORES]: scores });
  }

  async getAlerts(): Promise<Alert[]> {
    const result = await chrome.storage.local.get(this.KEYS.ALERTS);
    return result[this.KEYS.ALERTS] || [];
  }

  async addAlert(alert: Alert): Promise<void> {
    const alerts = await this.getAlerts();
    alerts.unshift(alert); // Add to beginning

    // Keep only last 100 alerts
    const trimmed = alerts.slice(0, 100);

    await chrome.storage.local.set({ [this.KEYS.ALERTS]: trimmed });
  }

  async markAlertRead(alertId: string): Promise<void> {
    const alerts = await this.getAlerts();
    const alert = alerts.find(a => a.id === alertId);

    if (alert) {
      alert.read = true;
      await chrome.storage.local.set({ [this.KEYS.ALERTS]: alerts });
    }
  }

  async clearAlerts(): Promise<void> {
    await chrome.storage.local.set({ [this.KEYS.ALERTS]: [] });
  }

  async getExtensionVersion(extensionId: string): Promise<string | null> {
    const result = await chrome.storage.local.get(this.KEYS.EXTENSION_VERSIONS);
    const versions = result[this.KEYS.EXTENSION_VERSIONS] || {};
    return versions[extensionId] || null;
  }

  async saveExtensionVersion(extensionId: string, version: string): Promise<void> {
    const result = await chrome.storage.local.get(this.KEYS.EXTENSION_VERSIONS);
    const versions = result[this.KEYS.EXTENSION_VERSIONS] || {};
    versions[extensionId] = version;
    await chrome.storage.local.set({ [this.KEYS.EXTENSION_VERSIONS]: versions });
  }
}
