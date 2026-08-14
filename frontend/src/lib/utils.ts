import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: 'text-danger-600 bg-danger-50 border-danger-200',
    high: 'text-danger-600 bg-danger-50 border-danger-200',
    medium: 'text-warning-600 bg-warning-50 border-warning-200',
    low: 'text-primary-600 bg-primary-50 border-primary-200',
    info: 'text-gray-600 bg-gray-50 border-gray-200',
  };
  return colors[severity] || colors.info;
}

export function getSeverityBadge(severity: string): string {
  const badges: Record<string, string> = {
    critical: 'badge-critical',
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
    info: 'badge-info',
  };
  return badges[severity] || badges.info;
}

export function getConfidenceBadge(confidence: string): string {
  const badges: Record<string, string> = {
    confirmed: 'badge-confirmed',
    likely: 'badge-likely',
    potential: 'badge-potential',
    unknown: 'badge-unknown',
    not_observed: 'badge-unknown',
    analysis_incomplete: 'badge-unknown',
  };
  return badges[confidence] || badges.unknown;
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    permission_risk: 'Permission Risk',
    dangerous_api: 'Dangerous API',
    data_access: 'Data Access',
    network_exfiltration: 'Network Exfiltration',
    obfuscation: 'Obfuscation',
    dependency_risk: 'Dependency Risk',
    purpose_mismatch: 'Purpose Mismatch',
    privacy_policy_discrepancy: 'Privacy Policy Discrepancy',
    runtime_behavior: 'Runtime Behavior',
    csp_bypass: 'CSP Bypass',
    remote_code_execution: 'Remote Code Execution',
    supply_chain: 'Supply Chain',
  };
  return labels[category] || category;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}