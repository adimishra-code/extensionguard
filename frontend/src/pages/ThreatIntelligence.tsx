import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  Search,
  Globe,
  Code,
  Package,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Plus,
  RefreshCw,
  Clock,
} from 'lucide-react';

import { threatIntelApi } from '../lib/api';
import { getSeverityBadge, formatRelativeTime, cn } from '../lib/utils';
import type { ThreatIntelligenceItem, CommunityReportItem } from '@extension-guard/shared';

export function ThreatIntelligence() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'threats' | 'reports'>('threats');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupType, setLookupType] = useState<'extension' | 'domain'>('domain');
  const [showReportModal, setShowReportModal] = useState(false);

  // New report form state
  const [reportExtId, setReportExtId] = useState('');
  const [reportExtName, setReportExtName] = useState('');
  const [reportType, setReportType] = useState('malicious');
  const [reportDesc, setReportDesc] = useState('');
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  // Fetch threat feed
  const {
    data: threats,
    isLoading: isLoadingThreats,
    refetch: refetchThreats,
  } = useQuery<ThreatIntelligenceItem[]>({
    queryKey: ['threats', typeFilter],
    queryFn: () =>
      threatIntelApi
        .listThreats(typeFilter !== 'all' ? { type: typeFilter } : undefined)
        .then((r) => r.data),
  });

  // Fetch community reports
  const {
    data: reportsData,
    isLoading: isLoadingReports,
    refetch: refetchReports,
  } = useQuery<{ reports: CommunityReportItem[]; total: number }>({
    queryKey: ['community-reports'],
    queryFn: () => threatIntelApi.listReports().then((r) => r.data),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['threat-stats'],
    queryFn: () => threatIntelApi.getStats().then((r) => r.data),
  });

  // Lookup mutation
  const lookupMutation = useMutation({
    mutationFn: async ({ query, type }: { query: string; type: 'extension' | 'domain' }) => {
      if (type === 'extension') {
        return (await threatIntelApi.checkExtension(query)).data;
      } else {
        return (await threatIntelApi.checkDomain(query)).data;
      }
    },
  });

  // Verify threat mutation
  const verifyMutation = useMutation({
    mutationFn: (id: string) => threatIntelApi.verifyThreat(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threats'] });
      queryClient.invalidateQueries({ queryKey: ['threat-stats'] });
    },
  });

  // Submit report mutation
  const submitReportMutation = useMutation({
    mutationFn: () =>
      threatIntelApi.submitReport({
        extensionId: reportExtId,
        extensionName: reportExtName,
        reportType,
        description: reportDesc,
      }),
    onSuccess: () => {
      setReportFeedback('Report submitted successfully! Our analysts will review it.');
      setReportExtId('');
      setReportExtName('');
      setReportDesc('');
      queryClient.invalidateQueries({ queryKey: ['community-reports'] });
      queryClient.invalidateQueries({ queryKey: ['threat-stats'] });
      setTimeout(() => {
        setShowReportModal(false);
        setReportFeedback(null);
      }, 1500);
    },
    onError: (err: any) => {
      setReportFeedback(err.response?.data?.error || 'Failed to submit report. Please log in first.');
    },
  });

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupQuery.trim()) return;
    lookupMutation.mutate({ query: lookupQuery.trim(), type: lookupType });
  };

  const filteredThreats = threats?.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.domain && item.domain.toLowerCase().includes(q)) ||
      (item.pattern && item.pattern.toLowerCase().includes(q)) ||
      (item.extension_id && item.extension_id.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'domain':
        return <Globe className="h-4 w-4 text-blue-500" />;
      case 'code_pattern':
        return <Code className="h-4 w-4 text-purple-500" />;
      case 'extension':
        return <Package className="h-4 w-4 text-orange-500" />;
      default:
        return <ShieldAlert className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-danger-600" />
            Threat Intelligence & IOCs
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Global repository of verified malicious domains, malicious extension patterns, and community threat reports.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              refetchThreats();
              refetchReports();
            }}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Refresh Feed
          </button>
          <button
            onClick={() => setShowReportModal(true)}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Report Threat
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Tracked Threats</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalThreats ?? threats?.length ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">Malicious domains & patterns</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">Verified IOCs</p>
          <p className="text-3xl font-bold text-success-600 mt-2">{stats?.verifiedThreats ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">High confidence signatures</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">Community Submissions</p>
          <p className="text-3xl font-bold text-primary-600 mt-2">{stats?.totalReports ?? reportsData?.total ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">Crowdsourced security reports</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 uppercase">Critical Severity</p>
          <p className="text-3xl font-bold text-danger-600 mt-2">{stats?.bySeverity?.critical ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">Immediate blocker status</p>
        </div>
      </div>

      {/* Quick IOC Lookup Bar */}
      <div className="card p-5 bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-lg">
        <div className="max-w-3xl">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Search className="h-5 w-5 text-primary-400" />
            Quick IOC & Reputation Lookup
          </h2>
          <p className="text-xs text-gray-300 mt-1">
            Query the threat intelligence engine to verify if a domain, URL host, or extension ID is blacklisted.
          </p>

          <form onSubmit={handleLookup} className="mt-4 flex flex-col sm:flex-row gap-2">
            <select
              value={lookupType}
              onChange={(e) => setLookupType(e.target.value as 'extension' | 'domain')}
              className="bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-primary-400"
            >
              <option value="domain">Domain Host</option>
              <option value="extension">Extension ID</option>
            </select>
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder={lookupType === 'domain' ? 'e.g. tracking-cdn.xyz' : 'e.g. adblock-ultra-demo'}
              className="flex-1 bg-gray-700 text-white placeholder-gray-400 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-primary-400"
            />
            <button
              type="submit"
              disabled={lookupMutation.isPending}
              className="btn-primary px-5 py-2 text-sm"
            >
              {lookupMutation.isPending ? 'Checking...' : 'Check Reputation'}
            </button>
          </form>

          {/* Lookup Result Box */}
          {lookupMutation.isSuccess && (
            <div className="mt-4 p-3 rounded-lg bg-gray-800/90 border border-gray-700 text-sm">
              {lookupMutation.data.isThreat ? (
                <div className="flex items-start gap-2.5 text-danger-400">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-danger-300">
                      Known Threat Detected! (Severity: {lookupMutation.data.severity?.toUpperCase()})
                    </span>
                    <p className="text-xs text-gray-300 mt-1">
                      {lookupMutation.data.threats?.[0]?.description ||
                        'This identifier matches verified malicious activity in our database.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-success-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>
                    No known threat indicators found for <span className="font-mono">{lookupQuery}</span>.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-6">
        <button
          onClick={() => setActiveTab('threats')}
          className={cn(
            'pb-3 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'threats'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          )}
        >
          Active Threat Database ({threats?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={cn(
            'pb-3 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'reports'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          )}
        >
          Community Reports ({reportsData?.reports?.length || 0})
        </button>
      </div>

      {/* Tab: Threat Feeds */}
      {activeTab === 'threats' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search IOCs, patterns, domains..."
                className="input pl-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="input text-sm py-1.5"
              >
                <option value="all">All Threat Types</option>
                <option value="domain">Domains</option>
                <option value="code_pattern">Code Patterns</option>
                <option value="extension">Extensions</option>
                <option value="supply_chain">Supply Chain</option>
              </select>
            </div>
          </div>

          {/* Threats Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                    <th className="px-4 py-3">Indicator / Target</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {isLoadingThreats ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        Loading threat intelligence database...
                      </td>
                    </tr>
                  ) : filteredThreats && filteredThreats.length > 0 ? (
                    filteredThreats.map((threat) => (
                      <tr key={threat.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-semibold text-gray-900">
                            {threat.domain || threat.pattern || threat.extension_id || 'Global Signature'}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 max-w-md line-clamp-1">
                            {threat.description}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-xs text-gray-700 capitalize">
                            {getTypeIcon(threat.type)} {threat.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('badge text-xs', getSeverityBadge(threat.severity))}>
                            {threat.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {Math.round(threat.confidence * 100)}%
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 capitalize">
                          {threat.source}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {threat.verified_at ? (
                            <span className="text-success-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                            </span>
                          ) : (
                            <span className="text-warning-600 flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> Unverified
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!threat.verified_at && (
                            <button
                              onClick={() => verifyMutation.mutate(threat.id)}
                              className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                            >
                              Verify
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        No threat indicators match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Community Reports */}
      {activeTab === 'reports' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                  <th className="px-4 py-3">Reported Extension</th>
                  <th className="px-4 py-3">Report Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Reported</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reviewer Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {isLoadingReports ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">
                      Loading community reports...
                    </td>
                  </tr>
                ) : reportsData?.reports && reportsData.reports.length > 0 ? (
                  reportsData.reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{report.extension_name}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          ID: {report.extension_id} {report.extension_version ? `v${report.extension_version}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge bg-primary-50 text-primary-700 capitalize">
                          {report.report_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-sm">
                        {report.description}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatRelativeTime(report.reported_at)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={cn(
                            'badge',
                            report.status === 'verified'
                              ? 'bg-success-100 text-success-800'
                              : report.status === 'pending'
                              ? 'bg-warning-100 text-warning-800'
                              : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {report.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 italic">
                        {report.review_notes || '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">
                      No community reports submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submit Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-danger-600" />
              Report Malicious Extension
            </h3>
            <p className="text-xs text-gray-500">
              Submit observations regarding abusive permissions, unauthorized telemetry, or malicious updates.
            </p>

            {reportFeedback && (
              <div className="p-3 text-xs rounded-lg bg-primary-50 border border-primary-200 text-primary-800">
                {reportFeedback}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700">Extension Name *</label>
                <input
                  type="text"
                  value={reportExtName}
                  onChange={(e) => setReportExtName(e.target.value)}
                  placeholder="e.g. Suspicious Cleaner Pro"
                  className="input text-sm mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Extension ID or Store URL *</label>
                <input
                  type="text"
                  value={reportExtId}
                  onChange={(e) => setReportExtId(e.target.value)}
                  placeholder="e.g. nmmhkkegccagdldgiimedpiccmgmieda"
                  className="input text-sm mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Report Category</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="input text-sm mt-1"
                >
                  <option value="data_theft">Data Theft / Exfiltration</option>
                  <option value="malicious">Malware / Backdoor</option>
                  <option value="suspicious">Suspicious Permissions</option>
                  <option value="privacy_violation">Privacy Policy Discrepancy</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Description & Details *</label>
                <textarea
                  rows={3}
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="Describe observed network requests, unexpected permission prompts, or source code snippets..."
                  className="input text-sm mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reportExtName || !reportExtId || !reportDesc || submitReportMutation.isPending}
                onClick={() => submitReportMutation.mutate()}
                className="btn-primary text-sm"
              >
                {submitReportMutation.isPending ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThreatIntelligence;
