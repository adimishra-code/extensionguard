import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, ExternalLink } from 'lucide-react';
import { extensionsApi } from '../lib/api';
import { formatDate, getSeverityBadge, cn } from '../lib/utils';
import type { Scan, Severity } from '@extension-guard/shared';

export function ExtensionDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: extension, isLoading, isError, error } = useQuery({
    queryKey: ['extension', id],
    queryFn: () => extensionsApi.get(id!).then(r => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        <p className="text-gray-500 font-medium">Loading extension profile...</p>
      </div>
    );
  }

  if (isError || !extension) {
    return (
      <div className="card p-8 text-center max-w-xl mx-auto space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Extension Not Found</h2>
        <p className="text-gray-500 text-sm">
          {error instanceof Error ? error.message : 'Unable to find requested extension record.'}
        </p>
        <Link to="/extensions" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Extensions List
        </Link>
      </div>
    );
  }

  const manifest = extension.manifest_json || extension.manifest;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/extensions" className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{extension.name}</h1>
              <span className="text-sm font-medium text-gray-500">v{extension.version}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">ID: <span className="font-mono">{extension.id}</span></p>
          </div>
        </div>

        <Link to="/scan" className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Scan New Version
        </Link>
      </div>

      {/* Extension Metadata Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="card p-6 md:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Extension Profile</h2>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Target Browser</dt>
              <dd className="font-semibold text-gray-900 capitalize">{extension.browser}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Source Type</dt>
              <dd className="font-semibold text-gray-900 capitalize">{extension.source}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Package Size</dt>
              <dd className="font-semibold text-gray-900">{(extension.size_bytes / 1024 / 1024).toFixed(2)} MB</dd>
            </div>
            <div>
              <dt className="text-gray-500">First Uploaded</dt>
              <dd className="font-semibold text-gray-900">{formatDate(extension.created_at)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">SHA-256 Checksum</dt>
              <dd className="font-mono text-xs text-gray-800 bg-gray-50 p-2 rounded border border-gray-200 mt-1 break-all">
                {extension.hash}
              </dd>
            </div>
          </dl>

          {manifest?.description && (
            <div className="pt-3 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase">Description</span>
              <p className="text-sm text-gray-700 mt-1">{manifest.description}</p>
            </div>
          )}
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Declared Permissions</h3>
          {manifest?.permissions?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {manifest.permissions.map((p: string) => (
                <span key={p} className="badge bg-gray-100 text-gray-800 font-mono text-xs">
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No static permissions declared.</p>
          )}

          <h3 className="font-semibold text-gray-900 pt-2 border-t border-gray-100">Host Scopes</h3>
          {manifest?.host_permissions?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {manifest.host_permissions.map((h: string) => (
                <span key={h} className="badge bg-primary-50 text-primary-700 font-mono text-xs">
                  {h}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No host permissions declared.</p>
          )}
        </div>
      </div>

      {/* Historical Scans */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Audit Scan History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Scan Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Risk Score</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {!extension.scans?.length ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">No previous scans found for this extension.</td>
                </tr>
              ) : (
                extension.scans.map((scan: Scan) => {
                  const score = scan.risk_scores?.overall_score;
                  const severity: Severity | undefined = 
                    score !== undefined ? (
                      score >= 70 ? 'critical' :
                      score >= 50 ? 'high' :
                      score >= 30 ? 'medium' : 'low'
                    ) : undefined;

                  return (
                    <tr key={scan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 capitalize">{scan.type}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'badge capitalize',
                          scan.status === 'completed' ? 'bg-success-100 text-success-800' :
                          scan.status === 'failed' ? 'bg-danger-100 text-danger-800' :
                          'bg-primary-100 text-primary-800'
                        )}>
                          {scan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {score !== undefined && severity ? (
                          <span className={cn('badge', getSeverityBadge(severity))}>
                            {score} / 100
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(scan.started_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/scans/${scan.id}`}
                          className="btn-secondary py-1 px-3 text-xs inline-flex items-center gap-1"
                        >
                          View Report <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
