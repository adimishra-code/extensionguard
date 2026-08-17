import { useQuery } from '@tanstack/react-query';
import { Shield, AlertTriangle, CheckCircle, FileText, TrendingUp } from 'lucide-react';
import { formatRelativeTime, getSeverityBadge, cn } from '../lib/utils';
import { scansApi, extensionsApi } from '../lib/api';
import type { Extension, Scan } from '@extension-guard/shared';

function StatCard({ title, value, icon: Icon, trend, color }: { 
  title: string; 
  value: string | number; 
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  color: string;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {trend && (
            <p className="text-sm text-success-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> {trend}
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', color)}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function RecentScanRow({ scan, extension }: { scan: Scan; extension?: Extension }) {
  const statusColors: Record<string, string> = {
    completed: 'bg-success-100 text-success-800',
    running: 'bg-primary-100 text-primary-800',
    pending: 'bg-warning-100 text-warning-800',
    failed: 'bg-danger-100 text-danger-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{extension?.name || 'Unknown Extension'}</div>
        <div className="text-sm text-gray-500">v{extension?.version || '0.0.0'}</div>
      </td>
      <td className="px-4 py-3">
        <span className={cn('badge', statusColors[scan.status] || 'bg-gray-100 text-gray-800')}>
          {scan.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {scan.risk_scores ? (
          <span className={cn('badge', getSeverityBadge(
            scan.risk_scores.overall_score >= 70 ? 'critical' :
            scan.risk_scores.overall_score >= 50 ? 'high' :
            scan.risk_scores.overall_score >= 30 ? 'medium' : 'low'
          ))}>
            {scan.risk_scores.overall_score}/100
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatRelativeTime(scan.started_at)}
      </td>
      <td className="px-4 py-3 text-right">
        <a href={`/scans/${scan.id}`} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
          View
        </a>
      </td>
    </tr>
  );
}

export function Dashboard() {
  const { data: extensionsData } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => extensionsApi.list({ limit: 5 }).then(r => r.data),
  });

  const { data: scansData } = useQuery({
    queryKey: ['scans', 'recent'],
    queryFn: () => scansApi.list({ limit: 10 }).then(r => r.data),
  });

  const totalExtensions = extensionsData?.total || 0;
  const totalScans = scansData?.total || 0;
  const completedScans = scansData?.scans?.filter((s: Scan) => s.status === 'completed').length || 0;
  const highRiskScans = scansData?.scans?.filter((s: Scan) => 
    s.risk_scores && s.risk_scores.overall_score >= 50
  ).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of extension security scans</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Extensions"
          value={totalExtensions}
          icon={Shield}
          color="bg-primary-500"
        />
        <StatCard
          title="Total Scans"
          value={totalScans}
          icon={FileText}
          color="bg-gray-500"
        />
        <StatCard
          title="Completed"
          value={completedScans}
          icon={CheckCircle}
          color="bg-success-500"
        />
        <StatCard
          title="High Risk"
          value={highRiskScans}
          icon={AlertTriangle}
          color="bg-danger-500"
        />
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Scans</h2>
          <a href="/scans" className="text-sm text-primary-600 hover:text-primary-700">
            View all
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extension</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Score</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scansData?.scans?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No scans yet. <a href="/scan" className="text-primary-600 hover:underline">Create your first scan</a>
                  </td>
                </tr>
              ) : (
                scansData?.scans?.map((scan: Scan) => (
                  <RecentScanRow key={scan.id} scan={scan} extension={scan.extension} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}