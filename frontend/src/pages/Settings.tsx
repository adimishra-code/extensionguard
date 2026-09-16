import { useQuery } from '@tanstack/react-query';
import { Server, Database, Cpu, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react';
import { healthApi } from '../lib/api';
import { cn } from '../lib/utils';

interface ServiceStatus {
  status: string;
  latency_ms?: number;
}

interface HealthDetail {
  status: string;
  timestamp: string;
  version: string;
  environment: string;
  metrics?: {
    total_scans: number;
    total_extensions: number;
    database_latency_ms: number;
    redis_latency_ms: number;
  };
  services?: {
    database: ServiceStatus;
    redis: ServiceStatus;
    worker: ServiceStatus;
  };
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="h-5 w-5 text-success-600" />
    : <XCircle className="h-5 w-5 text-danger-500" />;
}

function LatencyBadge({ ms }: { ms?: number }) {
  if (ms === undefined) return null;
  const color = ms < 20 ? 'text-success-600' : ms < 100 ? 'text-warning-600' : 'text-danger-600';
  return <span className={cn('font-mono text-xs', color)}>{ms}ms</span>;
}

export function Settings() {
  const { data: health, isLoading, refetch, dataUpdatedAt } = useQuery<HealthDetail>({
    queryKey: ['health', 'detailed'],
    queryFn: () => healthApi.detailed().then(r => r.data),
    refetchInterval: 15000,
    retry: 1,
  });

  const dbOk = health?.services?.database?.status === 'connected';
  const redisOk = health?.services?.redis?.status === 'connected';
  const workerOk = health?.services?.worker?.status === 'running';
  const overallOk = health?.status === 'healthy';

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System & Engine Settings</h1>
          <p className="text-gray-500 mt-1">Platform health diagnostics, analysis engine limits, and scanner rulesets</p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {lastChecked}
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {/* Overall health banner */}
      {health && (
        <div className={cn(
          'rounded-xl border px-5 py-3 flex items-center gap-3 text-sm font-medium',
          overallOk
            ? 'bg-success-50 border-success-200 text-success-800'
            : 'bg-danger-50 border-danger-200 text-danger-800'
        )}>
          <StatusIcon ok={overallOk} />
          Platform is {overallOk ? 'healthy' : 'degraded'} — {health.environment} · v{health.version}
        </div>
      )}

      {/* Service Status Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary-100 text-primary-700">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">API Service</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">Fastify v4</p>
              </div>
            </div>
            <StatusIcon ok={overallOk} />
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
            Engine Version: <span className="font-mono">{health?.version || '—'}</span>
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', dbOk ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700')}>
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">PostgreSQL DB</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">
                  {isLoading ? 'Checking...' : dbOk ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>
            <StatusIcon ok={dbOk} />
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100 flex justify-between">
            <span>Prisma Client v5</span>
            <LatencyBadge ms={health?.services?.database?.latency_ms} />
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', workerOk ? 'bg-warning-100 text-warning-700' : 'bg-danger-100 text-danger-700')}>
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">Async Worker</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">BullMQ + Redis</p>
              </div>
            </div>
            <StatusIcon ok={redisOk && workerOk} />
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100 flex justify-between">
            <span>2 workers active</span>
            <LatencyBadge ms={health?.metrics?.redis_latency_ms} />
          </p>
        </div>
      </div>

      {/* Metrics */}
      {health?.metrics && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Metrics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-gray-900">{health.metrics.total_scans}</p>
              <p className="text-xs text-gray-500 mt-1">Total Scans</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{health.metrics.total_extensions}</p>
              <p className="text-xs text-gray-500 mt-1">Extensions</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{health.metrics.database_latency_ms}ms</p>
              <p className="text-xs text-gray-500 mt-1">DB Latency</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{health.metrics.redis_latency_ms}ms</p>
              <p className="text-xs text-gray-500 mt-1">Redis Latency</p>
            </div>
          </div>
        </div>
      )}

      {/* Engine Configuration */}
      <div className="card p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Scan Pipeline Configuration</h2>

        <div className="grid sm:grid-cols-2 gap-6 text-sm">
          <div className="space-y-1">
            <label className="font-medium text-gray-900">Default Sandbox Timeout</label>
            <p className="text-xs text-gray-500">Maximum duration for Playwright synthetic site execution</p>
            <input
              type="text"
              readOnly
              value="120 seconds"
              className="input bg-gray-50 text-gray-700 mt-1 cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-gray-900">Maximum Upload Package Size</label>
            <p className="text-xs text-gray-500">Enforced by multipart body limit</p>
            <input
              type="text"
              readOnly
              value="50 MB (.zip / .crx)"
              className="input bg-gray-50 text-gray-700 mt-1 cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-gray-900">Static Analyzer Rulesets</label>
            <p className="text-xs text-gray-500">Active rules applied during AST analysis</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="badge bg-primary-50 text-primary-700">OWASP Top 10 Extensions</span>
              <span className="badge bg-primary-50 text-primary-700">Malware API Signatures</span>
              <span className="badge bg-primary-50 text-primary-700">Privacy & Exfiltration</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-medium text-gray-900">Synthetic Target Sites</label>
            <p className="text-xs text-gray-500">Isolated mock environments served to extensions</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="badge bg-gray-100 text-gray-800 font-mono text-xs">fake-mail.local</span>
              <span className="badge bg-gray-100 text-gray-800 font-mono text-xs">fake-bank.local</span>
              <span className="badge bg-gray-100 text-gray-800 font-mono text-xs">fake-social.local</span>
              <span className="badge bg-gray-100 text-gray-800 font-mono text-xs">fake-health.local</span>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card p-6 bg-gray-50 space-y-3">
        <h3 className="font-semibold text-gray-900">About ExtensionGuard</h3>
        <p className="text-xs text-gray-600 leading-relaxed">
          ExtensionGuard provides automated static and dynamic runtime security audits for Chromium, Firefox, and Edge browser extensions.
          Built with Fastify, Playwright, React, and Python AST analyzers. Version {health?.version || '1.0.0'}.
        </p>
      </div>
    </div>
  );
}
