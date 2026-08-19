import React from 'react';
import { AlertTriangle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import type { Alert } from '@/types';

interface AlertNotificationProps {
  alert: Alert;
  onDismiss: (alertId: string) => void;
  onAction?: (alertId: string) => void;
}

export function AlertNotification({ alert, onDismiss, onAction }: AlertNotificationProps) {
  const getIcon = () => {
    switch (alert.severity) {
      case 'critical':
        return <XCircle className="w-5 h-5" />;
      case 'high':
        return <AlertTriangle className="w-5 h-5" />;
      case 'medium':
        return <AlertCircle className="w-5 h-5" />;
      case 'low':
        return <Info className="w-5 h-5" />;
    }
  };

  const getColors = () => {
    switch (alert.severity) {
      case 'critical':
        return 'bg-red-50 border-red-500 text-red-900';
      case 'high':
        return 'bg-orange-50 border-orange-500 text-orange-900';
      case 'medium':
        return 'bg-yellow-50 border-yellow-500 text-yellow-900';
      case 'low':
        return 'bg-blue-50 border-blue-500 text-blue-900';
    }
  };

  return (
    <div className={`border-l-4 rounded-lg p-3 shadow-md ${getColors()}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{getIcon()}</div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm">{alert.extensionName}</h4>
          <p className="text-xs mt-1">{alert.message}</p>
          <p className="text-xs opacity-70 mt-1">
            {new Date(alert.timestamp).toLocaleString()}
          </p>
          {alert.actionRequired && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onAction?.(alert.id)}
                className="text-xs px-2 py-1 bg-white rounded hover:bg-opacity-80"
              >
                Take Action
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          className="opacity-70 hover:opacity-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
