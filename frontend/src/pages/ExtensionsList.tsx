import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Shield, Search, Plus, RefreshCw, ExternalLink } from 'lucide-react';
import { extensionsApi } from '../lib/api';
import { formatDate, getSeverityBadge, cn } from '../lib/utils';
import type { Extension, Severity } from '@extension-guard/shared';

export function ExtensionsList() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['extensions', search, page],
    queryFn: () => extensionsApi.list({ limit, offset: page * limit, search: search || undefined }).then(r => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analyzed Extensions</h1>
          <p className="text-gray-500 mt-1">Catalog of all uploaded extensions and security audit histories</p>
        </div>
        <Link to="/scan" className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> New Extension Scan
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search extensions by name or SHA-256 hash..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="input pl-9 text-sm"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Extensions Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Extension</th>
                <th className="px-4 py-3">Browser</th>
                <th className="px-4 py-3">Latest Risk Score</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Last Scanned</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary-600 mb-2" />
                    Loading extensions...
                  </td>
                </tr>
              ) : isError || !data?.extensions?.length ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <Shield className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                    <p className="font-semibold text-gray-700">No extensions found</p>
                    <p className="text-xs text-gray-400 mt-1">Upload an extension package to run security audits.</p>
                  </td>
                </tr>
              ) : (
                data.extensions.map((ext: Extension) => {
                  const latestScan = ext.scans?.[0];
                  const score = latestScan?.risk_scores?.overall_score;
                  const severity: Severity | undefined = 
                    score !== undefined ? (
                      score >= 70 ? 'critical' :
                      score >= 50 ? 'high' :
                      score >= 30 ? 'medium' : 'low'
                    ) : undefined;

                  return (
                    <tr key={ext.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link to={`/extensions/${ext.id}`} className="font-semibold text-gray-900 hover:text-primary-600">
                          {ext.name}
                        </Link>
                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                          <span>v{ext.version}</span>
                          <span>•</span>
                          <span className="font-mono truncate max-w-[120px]" title={ext.hash}>
                            {ext.hash.slice(0, 10)}...
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-700">{ext.browser}</td>
                      <td className="px-4 py-3">
                        {score !== undefined && severity ? (
                          <span className={cn('badge', getSeverityBadge(severity))}>
                            {score} / 100 ({severity})
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Not analyzed</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {(ext.size_bytes / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {ext.last_scanned_at ? formatDate(ext.last_scanned_at) : formatDate(ext.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={latestScan ? `/scans/${latestScan.id}` : `/extensions/${ext.id}`}
                          className="btn-secondary py-1 px-3 text-xs inline-flex items-center gap-1"
                        >
                          View Audit <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > limit && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, data.total)} of {data.total} extensions
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="btn-secondary py-1 px-3 text-xs"
              >
                Previous
              </button>
              <button
                disabled={(page + 1) * limit >= data.total}
                onClick={() => setPage(p => p + 1)}
                className="btn-secondary py-1 px-3 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
