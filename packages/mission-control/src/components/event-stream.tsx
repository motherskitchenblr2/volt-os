'use client';

import { useState, useEffect, useRef } from 'react';
import { StatusBadge } from './status-badge';
import type { Event } from '@/lib/types';

interface EventStreamProps {
  events: Event[];
}

export function EventStream({ events }: EventStreamProps) {
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = events.filter((e) => {
    if (filter && e.severity !== filter) return false;
    if (search && !JSON.stringify(e).toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-secondary border border-border rounded px-2 py-1 text-xs font-mono"
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs font-mono"
        />
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No events</p>
        ) : (
          filtered.map((event) => (
            <div
              key={event.id}
              className="bg-secondary/50 border border-border rounded p-2 text-xs"
            >
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={event.severity} size="sm" />
                <span className="font-mono text-muted-foreground">{event.type}</span>
                <span className="ml-auto text-muted-foreground font-mono">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {event.correlationId && (
                <p className="text-muted-foreground font-mono text-[10px]">
                  correlation: {event.correlationId}
                </p>
              )}
              <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
