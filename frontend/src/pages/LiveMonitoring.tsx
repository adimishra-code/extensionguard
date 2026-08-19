import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Shield, TrendingUp, Radio } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../lib/utils';

interface LiveStats {
  connectedClients: number;
  totalExtensions: number;
  activeAlerts: number;
  recentEvents: number;
}

interface RecentEvent {
  id: string;
  type: string;
  extensionId: string;
  extensionName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
}

export function LiveMonitoring() {
  const [stats, setStats] = useState<LiveStats>({
    connectedClients: 0,
    totalExtensions: 0,
    activeAlerts: 0,
    recentEvents: 0,
  });
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Connect to WebSocket for live updates
    const ws = new WebSocket('ws://localhost:3001/ws');

    ws.onopen = () => {
      console.log('Connected to live monitoring');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'stats_update') {
        setStats(data.stats);
      }

      if (data.type === 'new_event') {
        setEvents((prev) => [data.event, ...prev].slice(0, 50));
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from live monitoring');
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Monitoring</h1>
          <p className="text-gray-500 mt-1">Real-time extension activity and alerts</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
              connected
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            )}
          >
            <Radio className={cn('h-4 w-4', connected && 'animate-pulse')} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Connected Clients</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.connectedClients}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500">
              <Activity className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Extensions</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.totalExtensions}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-500">
              <Shield className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Alerts</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.activeAlerts}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-red-500">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Recent Events</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.recentEvents}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-green-500">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Event Stream */}
      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Event Stream</h2>
          <p className="text-sm text-gray-500 mt-1">
            Real-time supply chain events and security alerts
          </p>
        </div>
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Waiting for events...</p>
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className={cn(
                  'border-l-4 rounded-lg p-3',
                  getSeverityColor(event.severity)
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {event.extensionName}
                      </span>
                      <span className="text-xs opacity-70">
                        {event.type}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{event.message}</p>
                  </div>
                  <span className="text-xs opacity-70 ml-2">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
