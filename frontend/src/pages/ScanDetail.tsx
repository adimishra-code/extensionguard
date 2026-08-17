import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Shield, AlertTriangle, CheckCircle, FileText, Globe, Code, 
  Database, RefreshCw, Download, ArrowLeft, ExternalLink, Terminal, AlertCircle, Trash2
} from 'lucide-react';
import { scansApi } from '../lib/api';
import { formatDate, formatRelativeTime, getSeverityBadge, getConfidenceBadge, getCategoryLabel, cn } from '../lib/utils';
import type { Finding, Severity } from '@extension-guard/shared';

export function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'permissions' | 'network' | 'code' | 'evidence'>('overview');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  const { data: scan, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => scansApi.get(id!).then(r => r.data),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'pending' || data?.status === 'running' ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => scansApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      window.location.href = '/dashboard';
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="h-10 w-10 animate-spin text-primary-600" />
        <p className="text-gray-500 font-medium">Loading scan analysis report...</p>
      </div>
    );
  }

  if (isError || !scan) {
    return (
      <div className="card p-8 text-center max-w-xl mx-auto space-y-4">
        <AlertTriangle className="h-12 w-12 text-danger-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Scan Not Found</h2>
        <p className="text-gray-500 text-sm">
          {error instanceof Error ? error.message : 'Unable to retrieve scan data.'}
        </p>
        <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const overallScore = scan.risk_scores?.overall_score ?? 0;
  const overallSeverity: Severity = 
    overallScore >= 70 ? 'critical' :
    overallScore >= 50 ? 'high' :
    overallScore >= 30 ? 'medium' : 'low';

  const filteredFindings = (scan.findings || []).filter(f => 
    selectedSeverity === 'all' ? true : f.severity === selectedSeverity
  );

  const downloadReport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scan, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `extension-guard-report-${scan.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{scan.extension?.name || 'Extension Scan'}</h1>
              <span className="text-sm font-medium text-gray-500">v{scan.extension?.version || '0.0.0'}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Scan ID: <span className="font-mono">{scan.id}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => refetch()} 
            className="btn-secondary text-sm flex items-center gap-1.5"
            title="Refresh Scan"
          >
            <RefreshCw className={cn("h-4 w-4", (scan.status === 'running' || scan.status === 'pending') && "animate-spin")} />
            Refresh
          </button>
          <button 
            onClick={downloadReport} 
            className="btn-secondary text-sm flex items-center gap-1.5"
            title="Export JSON Report"
          >
            <Download className="h-4 w-4" /> Export Report
          </button>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this scan?')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="btn-danger text-sm flex items-center gap-1.5"
            title="Delete Scan"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      {/* Overview Status Banner */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-6 bg-white flex items-center gap-4">
          <div className={cn(
            "p-3 rounded-2xl flex items-center justify-center text-white",
            overallSeverity === 'critical' || overallSeverity === 'high' ? 'bg-danger-600' :
            overallSeverity === 'medium' ? 'bg-warning-500' : 'bg-success-600'
          )}>
            <Shield className="h-8 w-8" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Overall Risk Score</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-gray-900">{overallScore}</span>
              <span className="text-sm text-gray-500">/ 100</span>
            </div>
            <span className={cn('badge mt-1', getSeverityBadge(overallSeverity))}>
              {overallSeverity.toUpperCase()} RISK
            </span>
          </div>
        </div>

        <div className="card p-6 bg-white flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary-100 text-primary-700">
            <FileText className="h-8 w-8" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Findings</p>
            <p className="text-3xl font-extrabold text-gray-900 mt-1">{scan.findings?.length || 0}</p>
            <p className="text-xs text-gray-500 mt-1">
              {(scan.findings || []).filter(f => f.severity === 'critical' || f.severity === 'high').length} high severity
            </p>
          </div>
        </div>

        <div className="card p-6 bg-white flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gray-100 text-gray-700">
            <Terminal className="h-8 w-8" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scan Status</p>
            <p className="text-xl font-bold text-gray-900 mt-1 capitalize">{scan.status}</p>
            <p className="text-xs text-gray-500 mt-1">Type: <span className="capitalize font-medium">{scan.type}</span></p>
          </div>
        </div>

        <div className="card p-6 bg-white flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gray-100 text-gray-700">
            <Globe className="h-8 w-8" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Execution Time</p>
            <p className="text-base font-semibold text-gray-900 mt-1">{formatDate(scan.started_at)}</p>
            <p className="text-xs text-gray-500 mt-1">{formatRelativeTime(scan.started_at)}</p>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6 overflow-x-auto pb-px">
          {[
            { key: 'overview', label: 'Overview & Breakdown', icon: Shield, count: undefined },
            { key: 'findings', label: 'Security Findings', icon: AlertCircle, count: scan.findings?.length },
            { key: 'permissions', label: 'Permissions & Hosts', icon: Globe, count: scan.permission_risks?.length },
            { key: 'network', label: 'Network Events', icon: ExternalLink, count: scan.network_events?.length },
            { key: 'code', label: 'Code Findings', icon: Code, count: scan.code_findings?.length },
            { key: 'evidence', label: 'Raw Evidence', icon: Database, count: scan.evidence?.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={cn(
                  "flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn(
                    "ml-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                    isActive ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Risk Breakdown by Category</h2>
            <div className="space-y-4">
              {[
                { name: 'Permissions Risk', score: scan.risk_scores?.permission_score ?? 0, desc: 'Over-privileged or dangerous browser permissions' },
                { name: 'Dangerous Code APIs', score: scan.risk_scores?.code_score ?? 0, desc: 'Execution of dangerous APIs, eval, dynamic scripting' },
                { name: 'Data Access', score: scan.risk_scores?.data_access_score ?? 0, desc: 'Cookies, storage, clipboard, or local database access' },
                { name: 'Exfiltration & Network', score: scan.risk_scores?.exfiltration_score ?? 0, desc: 'External endpoints, trackers, beacon APIs' },
                { name: 'Code Obfuscation', score: scan.risk_scores?.obfuscation_score ?? 0, desc: 'Packed code, character arrays, hex/unicode encoding' },
                { name: 'Runtime Sandbox Behavior', score: scan.risk_scores?.runtime_score ?? 0, desc: 'Observed dynamic behavior during execution' },
              ].map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-900">{item.name}</span>
                    <span className="font-semibold text-gray-700">{item.score} / 100</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        item.score >= 70 ? "bg-danger-500" :
                        item.score >= 40 ? "bg-warning-500" :
                        item.score > 0 ? "bg-primary-500" : "bg-gray-300"
                      )}
                      style={{ width: `${Math.max(4, item.score)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Package Metadata</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <dt className="text-gray-500">Browser Target</dt>
                  <dd className="font-medium text-gray-900 capitalize">{scan.extension?.browser || 'Chrome'}</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <dt className="text-gray-500">Source</dt>
                  <dd className="font-medium text-gray-900 capitalize">{scan.extension?.source || 'Upload'}</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <dt className="text-gray-500">Package Size</dt>
                  <dd className="font-medium text-gray-900">
                    {scan.extension?.size_bytes ? (scan.extension.size_bytes / 1024 / 1024).toFixed(2) + ' MB' : '—'}
                  </dd>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <dt className="text-gray-500">SHA-256 Hash</dt>
                  <dd className="font-mono text-xs text-gray-700 truncate max-w-[160px]" title={scan.extension?.hash}>
                    {scan.extension?.hash ? scan.extension.hash.slice(0, 16) + '...' : '—'}
                  </dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-gray-500">Analyzer Version</dt>
                  <dd className="font-mono text-xs text-gray-900">{scan.analyzer_version || '0.1.0'}</dd>
                </div>
              </dl>
            </div>

            <div className="card p-6 bg-gray-50 border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Analysis Scope</h3>
              <ul className="text-xs text-gray-600 space-y-1.5">
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-success-600" /> Manifest & host permission audit</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-success-600" /> JavaScript AST static parsing</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-success-600" /> Dangerous API pattern matching</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-success-600" /> Obfuscation & anti-analysis heuristics</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-success-600" /> Suspicious domain / IP extraction</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Security Findings */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Discovered Security Findings</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Filter Severity:</span>
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="input py-1 text-xs w-auto"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="card p-12 text-center text-gray-500">
              <CheckCircle className="h-12 w-12 text-success-500 mx-auto mb-2" />
              <p className="text-base font-semibold text-gray-900">No findings match the selected filter.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((finding: Finding) => (
                <div key={finding.id} className="card p-6 border-l-4 border-l-primary-500 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('badge', getSeverityBadge(finding.severity))}>
                        {finding.severity.toUpperCase()}
                      </span>
                      <span className={cn('badge', getConfidenceBadge(finding.confidence))}>
                        {finding.confidence}
                      </span>
                      <span className="badge bg-gray-100 text-gray-700">
                        {getCategoryLabel(finding.category)}
                      </span>
                    </div>
                    {finding.affected_file && (
                      <span className="text-xs font-mono text-gray-500">
                        {finding.affected_file}:{finding.affected_line || 1}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-gray-900">{finding.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{finding.description}</p>
                  </div>

                  {finding.code_snippet && (
                    <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                      <code>{finding.code_snippet}</code>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 text-xs">
                    <div>
                      <span className="font-semibold text-gray-700">Recommendation:</span>
                      <p className="text-gray-600 mt-0.5">{finding.recommendation}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Analysis Limitation:</span>
                      <p className="text-gray-500 mt-0.5">{finding.limitations}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Permissions & Hosts */}
      {activeTab === 'permissions' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Declared Permissions & Host Scopes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Permission / Host Pattern</th>
                  <th className="px-4 py-3">Risk Level</th>
                  <th className="px-4 py-3">Reasoning / Security Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {(scan.permission_risks || []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-500">No permissions requested.</td>
                  </tr>
                ) : (
                  (scan.permission_risks || []).map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{p.permission}</td>
                      <td className="px-4 py-3">
                        <span className={cn('badge', getSeverityBadge(p.risk_level))}>
                          {p.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Network Events */}
      {activeTab === 'network' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Captured Network Events & Endpoints</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">URL / Destination</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Classification</th>
                  <th className="px-4 py-3">Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {(scan.network_events || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">No network events recorded.</td>
                  </tr>
                ) : (
                  (scan.network_events || []).map((net) => (
                    <tr key={net.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-900 truncate max-w-md" title={net.url}>
                        {net.url}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-700">{net.domain}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{net.classification}</td>
                      <td className="px-4 py-3">
                        <span className={cn('badge', getSeverityBadge(net.risk_level))}>
                          {net.risk_level}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Code Findings */}
      {activeTab === 'code' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Static Code Findings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">File Location</th>
                  <th className="px-4 py-3">API / Pattern</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Code Snippet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {(scan.code_findings || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">No static code findings detected.</td>
                  </tr>
                ) : (
                  (scan.code_findings || []).map((cf) => (
                    <tr key={cf.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {cf.file_path}:{cf.line}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900">{cf.api}</td>
                      <td className="px-4 py-3">
                        <span className={cn('badge', getSeverityBadge(cf.severity))}>
                          {cf.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-800 max-w-sm truncate" title={cf.context}>
                        {cf.context}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Raw Evidence */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Evidence Chain</h2>
          {(scan.evidence || []).length === 0 ? (
            <div className="card p-12 text-center text-gray-500">No evidence items recorded.</div>
          ) : (
            (scan.evidence || []).map((ev) => (
              <div key={ev.id} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-gray-700">{ev.id}</span>
                    <span className="badge bg-primary-100 text-primary-700 capitalize">{ev.type}</span>
                    <span className="text-xs text-gray-500">Source: {ev.source}</span>
                  </div>
                  <span className={cn('badge', getConfidenceBadge(ev.confidence))}>
                    {ev.confidence}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900">{ev.description}</p>
                {ev.raw_data && (
                  <pre className="bg-gray-50 p-3 rounded-lg text-xs font-mono text-gray-800 overflow-x-auto">
                    {JSON.stringify(ev.raw_data, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
