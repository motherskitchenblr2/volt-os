'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import type { Pipeline } from '@/lib/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

type StatusFilter = 'all' | Pipeline['status'];

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'waiting_approval', label: 'Waiting Approval' },
  { value: 'failed', label: 'Failed' },
  { value: 'completed', label: 'Completed' },
];

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const fetchPipelines = async () => {
      try {
        const data = await api.getPipelines();
        setPipelines(data as Pipeline[]);
      } catch {
        console.error('Failed to fetch pipelines');
      }
    };

    fetchPipelines();
    const interval = setInterval(fetchPipelines, 5000);
    return () => clearInterval(interval);
  }, []);

  const filtered = filter === 'all' ? pipelines : pipelines.filter((p) => p.status === filter);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Pipelines</h1>
          <p className="text-sm text-muted-foreground mt-1">Pipeline orchestration and execution</p>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 mb-4 bg-card border border-border rounded-md p-1">
          {statusFilters.map((sf) => (
            <button
              key={sf.value}
              onClick={() => setFilter(sf.value)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                filter === sf.value
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {sf.label}
            </button>
          ))}
        </div>

        {/* Pipeline List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              No pipelines found
            </div>
          ) : (
            filtered.map((pipeline) => (
              <div
                key={pipeline.id}
                className="bg-card border border-border rounded-md"
              >
                <button
                  onClick={() => setExpanded(expanded === pipeline.id ? null : pipeline.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50"
                >
                  {expanded === pipeline.id ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{pipeline.id.slice(0, 8)}</span>
                  <span className="text-sm font-medium">{pipeline.name}</span>
                  <StatusBadge status={pipeline.status} size="sm" />
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {new Date(pipeline.startedAt).toLocaleString()}
                  </span>
                </button>

                {expanded === pipeline.id && (
                  <div className="border-t border-border p-3">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                      DAG Execution
                    </h3>
                    <div className="font-mono text-xs space-y-1">
                      {pipeline.tasks.map((task, idx) => (
                        <div key={task.id} className="flex items-center gap-2">
                          <span className="text-muted-foreground w-6 text-right">
                            {idx + 1}.
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span>{task.name}</span>
                          <StatusBadge status={task.status} size="sm" />
                          {task.agentId && (
                            <span className="text-muted-foreground">
                              agent:{task.agentId.slice(0, 6)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {pipeline.completedAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Completed: {new Date(pipeline.completedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
