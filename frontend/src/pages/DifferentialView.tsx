import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitCompare,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  PlusCircle,
  FileCode,
  Layers,
} from 'lucide-react';
import { differentialApi } from '../lib/api';
import { getSeverityBadge, formatRelativeTime, cn } from '../lib/utils';
import type { DifferentialAnalysisItem } from '@extension-guard/shared';

export function DifferentialView() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareExtId, setCompareExtId] = useState('');

  // Fetch latest differential analyses
  const {
    data: analysesData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['differential', 'latest'],
    queryFn: () => differentialApi.getLatest().then((r) => r.data),
  });

  // Fetch high risk updates
  const { data: highRiskData } = useQuery({
    queryKey: ['differential', 'high-risk'],
    queryFn: () => differentialApi.getHighRisk().then((r) => r.data),
  });

  // Compare on demand mutation
  const compareMutation = useMutation({
    mutationFn: (extId: string) => differentialApi.compareLatest(extId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['differential'] });
      setCompareExtId('');
    },
  });

  const analyses = analysesData?.analyses || [];
  const selectedAnalysis =
    analyses.find((a) => a.id === selectedId) || analyses[0] || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GitCompare className="h-7 w-7 text-primary-600" />
            Differential Analysis & Supply Chain Auditing
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Detect permission escalations, host scope expansions, and maintainer changes across version releases.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* High-Risk Escalation Banner */}
      {highRiskData?.analyses && highRiskData.analyses.length > 0 && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-danger-900">
                Critical Permission Escalation Detected ({highRiskData.analyses.length})
              </h2>
              <p className="text-xs text-danger-700 mt-1">
                Recent updates request broad host scopes or dangerous APIs compared to prior approved builds.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {highRiskData.analyses.map((a: DifferentialAnalysisItem) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className="text-xs px-2.5 py-1 bg-white rounded border border-danger-300 font-medium text-danger-800 hover:bg-danger-100/50 flex items-center gap-1"
                  >
                    <span>{a.extension_id}</span>
                    <span className="text-danger-500">
                      v{a.old_version} → v{a.new_version}
                    </span>
                    <span className="font-bold text-danger-700">+{a.risk_delta} Risk</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compare On-Demand Bar */}
      <div className="card p-4 flex flex-col sm:flex-row items-center gap-3 bg-gray-50 border border-gray-200">
        <div className="flex-1 w-full">
          <label className="text-xs font-semibold text-gray-700 block mb-1">
            Trigger Differential Comparison for Monitored Extension
          </label>
          <input
            type="text"
            value={compareExtId}
            onChange={(e) => setCompareExtId(e.target.value)}
            placeholder="Enter extension identifier (e.g. adblock-ultra-demo)"
            className="input text-sm"
          />
        </div>
        <button
          type="button"
          disabled={!compareExtId.trim() || compareMutation.isPending}
          onClick={() => compareMutation.mutate(compareExtId.trim())}
          className="btn-primary text-sm px-4 py-2 mt-auto sm:self-end whitespace-nowrap flex items-center gap-1.5"
        >
          <PlusCircle className="h-4 w-4" />
          {compareMutation.isPending ? 'Analyzing...' : 'Run Differential Diff'}
        </button>
      </div>

      {/* Main Content: Split Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Analyses List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Recorded Version Transitions ({analyses.length})
          </h2>

          {isLoading ? (
            <div className="card p-6 text-center text-sm text-gray-500">
              Loading version diff history...
            </div>
          ) : analyses.length > 0 ? (
            analyses.map((a: DifferentialAnalysisItem) => {
              const isSelected = selectedAnalysis?.id === a.id;
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'card p-4 cursor-pointer transition-all border',
                    isSelected
                      ? 'border-primary-500 ring-2 ring-primary-100 bg-primary-50/20'
                      : 'hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900 truncate">
                      {a.extension_id}
                    </span>
                    <span className={cn('badge text-xs', getSeverityBadge(a.severity))}>
                      {a.severity}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">v{a.old_version}</span>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded font-semibold text-gray-900">
                      v{a.new_version}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-2 border-t border-gray-100">
                    <span className="flex items-center gap-1 text-danger-600 font-medium">
                      <TrendingUp className="h-3 w-3" /> +{a.risk_delta} Risk Delta
                    </span>
                    <span>{formatRelativeTime(a.analysis_date)}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="card p-6 text-center text-sm text-gray-500">
              No version comparisons recorded yet.
            </div>
          )}
        </div>

        {/* Right: Selected Diff Details */}
        <div className="lg:col-span-2 space-y-5">
          {selectedAnalysis ? (
            <>
              {/* Diff Header Card */}
              <div className="card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {selectedAnalysis.extension_id}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Analyzed on {new Date(selectedAnalysis.analysis_date).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Risk Score Impact</p>
                      <p className="text-lg font-bold text-danger-600">
                        +{selectedAnalysis.risk_delta} Points
                      </p>
                    </div>
                    <span
                      className={cn(
                        'badge text-sm px-3 py-1',
                        getSeverityBadge(selectedAnalysis.severity)
                      )}
                    >
                      {selectedAnalysis.severity.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Version Transition Breadcrumbs */}
                <div className="mt-4 flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Previous Version</p>
                    <p className="font-mono text-sm font-bold text-gray-700">
                      v{selectedAnalysis.old_version}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 mx-2" />
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Updated Release</p>
                    <p className="font-mono text-sm font-bold text-primary-700">
                      v{selectedAnalysis.new_version}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-gray-500">Findings Added</p>
                    <p className="text-sm font-semibold text-danger-600">
                      +{selectedAnalysis.findings_added} vulnerabilities
                    </p>
                  </div>
                </div>

                {/* Code Changes Summary */}
                {selectedAnalysis.code_changes_summary && (
                  <div className="mt-4 p-3 bg-primary-50/50 rounded-lg border border-primary-100">
                    <h3 className="text-xs font-semibold text-primary-900 flex items-center gap-1.5">
                      <FileCode className="h-4 w-4 text-primary-600" />
                      Code Diff Summary
                    </h3>
                    <p className="text-xs text-primary-800 mt-1 leading-relaxed">
                      {selectedAnalysis.code_changes_summary}
                    </p>
                  </div>
                )}
              </div>

              {/* Permissions Diff Cards */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Added Permissions */}
                <div className="card p-5 border-l-4 border-l-danger-500">
                  <h3 className="text-sm font-semibold text-danger-900 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-danger-600" />
                    Permissions Escalated ({selectedAnalysis.permissions_added?.length || 0})
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    New capabilities granted to background or content workers
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedAnalysis.permissions_added &&
                    selectedAnalysis.permissions_added.length > 0 ? (
                      selectedAnalysis.permissions_added.map((perm: string) => (
                        <span
                          key={perm}
                          className="badge bg-danger-100 text-danger-800 font-mono text-xs border border-danger-300"
                        >
                          +{perm}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400 italic">No new permissions declared</span>
                    )}
                  </div>
                </div>

                {/* Host Permissions Expanded */}
                <div className="card p-5 border-l-4 border-l-warning-500">
                  <h3 className="text-sm font-semibold text-warning-900 flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-warning-600" />
                    Host Scopes Widened ({selectedAnalysis.host_permissions_added?.length || 0})
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Websites and domain origins the extension can intercept
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedAnalysis.host_permissions_added &&
                    selectedAnalysis.host_permissions_added.length > 0 ? (
                      selectedAnalysis.host_permissions_added.map((host: string) => (
                        <span
                          key={host}
                          className="badge bg-warning-100 text-warning-800 font-mono text-xs border border-warning-300"
                        >
                          +{host}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400 italic">No host scopes widened</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Removed Permissions & Hardening */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-success-900 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-success-600" />
                  Removed Permissions & Attack Surface Reductions
                </h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedAnalysis.permissions_removed &&
                  selectedAnalysis.permissions_removed.length > 0 ? (
                    selectedAnalysis.permissions_removed.map((perm: string) => (
                      <span
                        key={perm}
                        className="badge bg-success-50 text-success-700 font-mono text-xs border border-success-200"
                      >
                        -{perm}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400 italic">
                      No redundant permissions revoked in this release.
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card p-12 text-center text-gray-500">
              Select a version diff record on the left to inspect detailed changes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DifferentialView;
