import { useQuery } from '@tanstack/react-query';
import { Server, Database, Cpu, CheckCircle2, RefreshCw } from 'lucide-react';
import { healthApi } from '../lib/api';
import { cn } from '../lib/utils';

export function Settings() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check().then(r => r.data),
    refetchInterval: 10000,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System & Engine Settings</h1>
          <p className="text-gray-500 mt-1">Platform health diagnostics, analysis engine limits, and scanner rulesets</p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} /> Refresh Status
        </button>
      </div>

      {/* Health Status Cards */}
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
            <CheckCircle2 className="h-5 w-5 text-success-600" />
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
            Engine Version: <span className="font-mono">{health?.version || '0.1.0'}</span>
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success-100 text-success-700">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">PostgreSQL DB</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">Connected</p>
              </div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-success-600" />
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
            ORM: <span className="font-mono">Prisma Client v5</span>
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-warning-100 text-warning-700">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">Async Worker</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">BullMQ + Redis</p>
              </div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-success-600" />
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
            Concurrency: <span className="font-mono">2 workers active</span>
          </p>
        </div>
      </div>

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

      {/* About & API Information */}
      <div className="card p-6 bg-gray-50 space-y-3">
        <h3 className="font-semibold text-gray-900">About Extension Guard</h3>
        <p className="text-xs text-gray-600 leading-relaxed">
          Extension Guard provides automated static and dynamic runtime security audits for Chromium, Firefox, and Edge browser extensions. Built with Fastify, Playwright, React, and Python AST analyzers.
        </p>
      </div>
    </div>
  );
}
