'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import type { PlatformHealth, Pipeline, Agent, Event } from '@/lib/types';
import { Activity, Clock } from 'lucide-react';

export default function Dashboard() {
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, pipelinesRes, agentsRes, eventsRes] = await Promise.allSettled([
          api.getHealth(),
          api.getPipelines(),
          api.getAgents(),
          api.getEvents(),
        ]);

        if (healthRes.status === 'fulfilled') setHealth(healthRes.value as PlatformHealth);
        if (pipelinesRes.status === 'fulfilled') setPipelines(pipelinesRes.value as Pipeline[]);
        if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value as Agent[]);
        if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value as Event[]);
      } catch {
        console.error('Failed to fetch dashboard data');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const runningPipelines = pipelines.filter((p) => p.status === 'running').length;
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const securityAlerts = events.filter((e) => e.severity === 'critical' || e.severity === 'high').length;
  const recentEvents = events.slice(0, 10);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Platform overview and status</p>
        </div>

        {/* Platform Health */}
        <div className="mb-6 bg-card border border-border rounded-md p-4">
          <div className="flex items-center gap-3 mb-3">
            <Activity className="w-5 h-5" />
            <h2 className="text-sm font-medium uppercase tracking-wide">Platform Health</h2>
            {health && <StatusBadge status={health.status} />}
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <StatCard
              label="Active Pipelines"
              value={runningPipelines}
              sub={`${pipelines.length} total`}
            />
            <StatCard
              label="Running Agents"
              value={activeAgents}
              sub={`${agents.length} total`}
            />
            <StatCard
              label="Security Alerts"
              value={securityAlerts}
              sub="critical + high"
            />
            <StatCard
              label="Uptime"
              value={health ? `${Math.floor(health.uptime / 3600)}h` : '-'}
              sub={health ? `${Math.floor((health.uptime % 3600) / 60)}m` : ''}
            />
          </div>
        </div>

        {/* Service Status */}
        <div className="mb-6 bg-card border border-border rounded-md p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Service Status</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs text-muted-foreground uppercase">Service</th>
                  <th className="text-left py-2 px-3 text-xs text-muted-foreground uppercase">Status</th>
                  <th className="text-left py-2 px-3 text-xs text-muted-foreground uppercase">Last Check</th>
                </tr>
              </thead>
              <tbody>
                {health?.services.map((service) => (
                  <tr key={service.name} className="border-b border-border last:border-0">
                    <td className="py-2 px-3 font-mono text-xs">{service.name}</td>
                    <td className="py-2 px-3">
                      <StatusBadge status={service.status} size="sm" />
                    </td>
                    <td className="py-2 px-3 text-muted-foreground font-mono text-xs">
                      {new Date(service.lastCheck).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Events */}
        <div className="bg-card border border-border rounded-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" />
            <h2 className="text-sm font-medium uppercase tracking-wide">Recent Events</h2>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent events</p>
          ) : (
            <div className="space-y-1">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 py-1 text-xs border-b border-border last:border-0"
                >
                  <StatusBadge status={event.severity} size="sm" />
                  <span className="font-mono">{event.type}</span>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {event.correlationId && `corr:${event.correlationId.slice(0, 8)}`}
                  </span>
                  <span className="ml-auto text-muted-foreground font-mono">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
