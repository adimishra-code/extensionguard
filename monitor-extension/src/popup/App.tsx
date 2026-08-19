import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, AlertTriangle, CheckCircle, XCircle, Settings, RefreshCw, Bell, ExternalLink } from 'lucide-react';
import type { Extension, RiskScore, Alert, Config } from '@/types';
import { RISK_THRESHOLDS, DEFAULT_CONFIG } from '@/constants';
import './styles.css';

interface ExtensionWithRisk extends Extension {
  riskScore?: RiskScore;
}

function App() {
  const [extensions, setExtensions] = useState<ExtensionWithRisk[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'extensions' | 'alerts' | 'settings'>('extensions');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    try {
      // Get extensions
      const extensionsResponse = await chrome.runtime.sendMessage({ type: 'get-extensions' });
      const riskScores = await chrome.runtime.sendMessage({ type: 'get-risk-scores' });
      const alertsResponse = await chrome.runtime.sendMessage({ type: 'get-alerts' });

      // Load config
      const configResult = await chrome.storage.local.get('config');
      if (configResult.config) {
        setConfig(configResult.config);
      }

      // Merge risk scores with extensions
      const extensionsWithRisk = extensionsResponse.map((ext: Extension) => ({
        ...ext,
        riskScore: riskScores[ext.id],
      }));

      // Sort by risk score (highest first)
      extensionsWithRisk.sort((a: ExtensionWithRisk, b: ExtensionWithRisk) => {
        const scoreA = a.riskScore?.score || 0;
        const scoreB = b.riskScore?.score || 0;
        return scoreB - scoreA;
      });

      setExtensions(extensionsWithRisk);
      setAlerts(alertsResponse);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await chrome.runtime.sendMessage({ type: 'update-config', config });
      // Show success message briefly
      setTimeout(() => setSaving(false), 1000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaving(false);
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getSeverityBg = (severity?: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100';
      case 'high': return 'bg-orange-100';
      case 'medium': return 'bg-yellow-100';
      case 'low': return 'bg-green-100';
      default: return 'bg-gray-100';
    }
  };

  const getRiskIcon = (severity?: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <XCircle className="w-5 h-5" />;
      case 'medium':
        return <AlertTriangle className="w-5 h-5" />;
      case 'low':
        return <CheckCircle className="w-5 h-5" />;
      default:
        return <Shield className="w-5 h-5" />;
    }
  };

  const handleDisableExtension = async (extensionId: string) => {
    await chrome.runtime.sendMessage({ type: 'disable-extension', extensionId });
    await loadData();
  };

  const handleScanExtension = async (extensionId: string) => {
    await chrome.runtime.sendMessage({ type: 'scan-extension', extensionId });
  };

  const handleMarkAlertRead = async (alertId: string) => {
    await chrome.runtime.sendMessage({ type: 'mark-alert-read', alertId });
    await loadData();
  };

  const unreadAlertsCount = alerts.filter(a => !a.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6" />
            <h1 className="text-lg font-bold">Extension Guard</h1>
          </div>
          <button
            onClick={loadData}
            className="p-1 hover:bg-blue-700 rounded"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setView('extensions')}
            className={`px-3 py-1 rounded text-sm ${
              view === 'extensions' ? 'bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            Extensions ({extensions.length})
          </button>
          <button
            onClick={() => setView('alerts')}
            className={`px-3 py-1 rounded text-sm relative ${
              view === 'alerts' ? 'bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            Alerts ({unreadAlertsCount})
            {unreadAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                {unreadAlertsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setView('settings')}
            className={`px-3 py-1 rounded text-sm ${
              view === 'settings' ? 'bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {view === 'extensions' && (
          <div className="space-y-3">
            {extensions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No extensions found</p>
            ) : (
              extensions.map((ext) => (
                <div
                  key={ext.id}
                  className={`bg-white rounded-lg shadow p-3 border-l-4 ${
                    ext.riskScore
                      ? ext.riskScore.severity === 'critical'
                        ? 'border-red-500'
                        : ext.riskScore.severity === 'high'
                        ? 'border-orange-500'
                        : ext.riskScore.severity === 'medium'
                        ? 'border-yellow-500'
                        : 'border-green-500'
                      : 'border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {ext.icons && ext.icons.length > 0 ? (
                          <img
                            src={ext.icons[0].url}
                            alt={ext.name}
                            className="w-8 h-8 rounded"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                            <Shield className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-sm">{ext.name}</h3>
                          <p className="text-xs text-gray-500">v{ext.version}</p>
                        </div>
                      </div>

                      {ext.riskScore && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <span className={`${getSeverityColor(ext.riskScore.severity)}`}>
                              {getRiskIcon(ext.riskScore.severity)}
                            </span>
                            <span className="text-sm font-medium">
                              Risk Score: {ext.riskScore.score}/100
                            </span>
                          </div>
                          {ext.riskScore.reasons.length > 0 && (
                            <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                              {ext.riskScore.reasons.slice(0, 2).map((reason, idx) => (
                                <li key={idx}>{reason}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleScanExtension(ext.id)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        Scan
                      </button>
                      {ext.enabled && (
                        <button
                          onClick={() => handleDisableExtension(ext.id)}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === 'alerts' && (
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No alerts</p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-white rounded-lg shadow p-3 ${
                    alert.read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={getSeverityColor(alert.severity)}>
                          <Bell className="w-5 h-5" />
                        </span>
                        <span className="font-semibold text-sm">{alert.extensionName}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!alert.read && (
                      <button
                        onClick={() => handleMarkAlertRead(alert.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === 'settings' && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-bold text-lg mb-4">Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">API URL</label>
                <input
                  type="text"
                  value={config.apiUrl}
                  onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                  placeholder="https://api.extensionguard.dev"
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={config.apiKey || ''}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="eg_abc123..."
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your API key from{' '}
                  <a
                    href="https://extensionguard.dev/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    dashboard
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.syncEnabled}
                    onChange={(e) => setConfig({ ...config, syncEnabled: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Enable cloud sync</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">
                  Connect to backend for advanced threat intelligence
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Alert Level</label>
                <select
                  value={config.alertLevel}
                  onChange={(e) => setConfig({ ...config, alertLevel: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  <option value="all">All alerts</option>
                  <option value="high">High and Critical only</option>
                  <option value="critical">Critical only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Scan Frequency (minutes)
                </label>
                <input
                  type="number"
                  value={config.scanFrequency}
                  onChange={(e) => setConfig({ ...config, scanFrequency: parseInt(e.target.value) })}
                  min="5"
                  max="1440"
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-blue-400"
              >
                {saving ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
