'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Sidebar } from '@/components/sidebar';
import { StatusBadge } from '@/components/status-badge';
import { ErrorBoundary } from '@/components/error-boundary';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useEventsQuery } from '@/lib/api';
import { useWebSocket } from '@/hooks/use-websocket';
import { useDashboardStore } from '@/stores/dashboard-store';
import type { Event } from '@/lib/types';

// ---------------------------------------------------------------------------
// Virtual scrolling constants
// ---------------------------------------------------------------------------

/** Height of each event row in pixels */
const ROW_HEIGHT = 64;

/** How many extra rows to render above/below the visible viewport */
const OVERSCAN = 8;

export default function EventsPage() {
  // React Query for historical events
  const eventsQuery = useEventsQuery();

  // Zustand store for merged events + filters
  const storeEvents = useDashboardStore((s) => s.events);
  const addStoreEvent = useDashboardStore((s) => s.addEvent);
  const eventFilter = useDashboardStore((s) => s.eventFilter);
  const eventSearch = useDashboardStore((s) => s.eventSearch);
  const setEventFilter = useDashboardStore((s) => s.setEventFilter);
  const setEventSearch = useDashboardStore((s) => s.setEventSearch);

  // WebSocket for live events
  const { isConnected } = useWebSocket();

  // Seed store events from React Query once
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && eventsQuery.data) {
      // Store keeps max 1000 — write in reverse so newest is first
      const reversed = [...eventsQuery.data].reverse();
      useDashboardStore.getState().setEvents(reversed);
      seededRef.current = true;
    }
  }, [eventsQuery.data]);

  // --- Event list (merged) ---
  // If store has events (seeded from query + live WS), prefer store.
  // Otherwise fall back to query data.
  const allEvents: Event[] = useMemo(() => {
    if (storeEvents.length > 0) return storeEvents;
    if (eventsQuery.data) return eventsQuery.data;
    return [];
  }, [storeEvents, eventsQuery.data]);

  // --- Filtering ---
  const filteredEvents = useMemo(() => {
    return allEvents.filter((e) => {
      if (eventFilter && e.severity !== eventFilter) return false;
      if (
        eventSearch &&
        !JSON.stringify(e).toLowerCase().includes(eventSearch.toLowerCase())
      )
        return false;
      return true;
    });
  }, [allEvents, eventFilter, eventSearch]);

  // --- Virtual scrolling ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  const totalHeight = filteredEvents.length * ROW_HEIGHT;

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN,
  );
  const endIndex = Math.min(
    filteredEvents.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN,
  );

  const visibleEvents = useMemo(
    () => filteredEvents.slice(startIndex, endIndex),
    [filteredEvents, startIndex, endIndex],
  );

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Measure container height on mount & resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    setContainerHeight(el.clientHeight);

    return () => observer.disconnect();
  }, []);

  // --- Expanded event (drawer) ---
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCopyPayload = useCallback(
    (payload: Record<string, unknown>) => {
      navigator.clipboard
        .writeText(JSON.stringify(payload, null, 2))
        .catch(() => {
          console.error('Failed to copy payload');
        });
    },
    [],
  );

  const isLoading = eventsQuery.isLoading;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 p-6 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Events</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time event stream
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono">
              {filteredEvents.length} events
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-muted-foreground font-mono">
                {isConnected ? 'connected' : 'disconnected'}
              </span>
            </span>
          </div>
        </div>

        <ErrorBoundary>
          {isLoading ? (
            <LoadingSpinner label="Loading events…" />
          ) : (
            <div className="flex-1 bg-card border border-border rounded-md p-4 min-h-0 flex flex-col">
              {/* Filters */}
              <div className="flex gap-2 mb-3 shrink-0">
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
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
                  placeholder="Search events…"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs font-mono"
                />
              </div>

              {/* Virtual-scrolled list */}
              <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto relative"
                style={{ willChange: 'transform' }}
              >
                <div
                  style={{ height: totalHeight, position: 'relative' }}
                  className="w-full"
                >
                  {visibleEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No events
                    </p>
                  ) : (
                    visibleEvents.map((event, i) => {
                      const absoluteIndex = startIndex + i;
                      const isExpanded = expandedId === event.id;

                      return (
                        <div
                          key={event.id}
                          style={{
                            position: 'absolute',
                            top: absoluteIndex * ROW_HEIGHT,
                            left: 0,
                            right: 0,
                            height: ROW_HEIGHT,
                          }}
                          className="px-1"
                        >
                          <button
                            onClick={() =>
                              setExpandedId(
                                isExpanded ? null : event.id,
                              )
                            }
                            className="w-full text-left bg-secondary/50 border border-border rounded p-2 text-xs hover:bg-secondary/80 transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <StatusBadge
                                status={event.severity}
                                size="sm"
                              />
                              <span className="font-mono text-muted-foreground">
                                {event.type}
                              </span>
                              {event.correlationId && (
                                <span className="text-muted-foreground font-mono text-[10px]">
                                  corr:{event.correlationId.slice(0, 8)}
                                </span>
                              )}
                              <span className="ml-auto text-muted-foreground font-mono">
                                {new Date(
                                  event.timestamp,
                                ).toLocaleTimeString()}
                              </span>
                            </div>

                            {/* Expanded payload / drawer */}
                            {isExpanded && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 border-t border-border pt-2"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] text-muted-foreground uppercase">
                                    Payload
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleCopyPayload(event.payload)
                                    }
                                    className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary rounded font-mono hover:bg-primary/30 transition-colors"
                                  >
                                    Copy
                                  </button>
                                </div>
                                <pre className="text-[10px] text-muted-foreground overflow-x-auto max-h-32 overflow-y-auto">
                                  {JSON.stringify(
                                    event.payload,
                                    null,
                                    2,
                                  )}
                                </pre>
                                {event.correlationId && (
                                  <p className="text-muted-foreground font-mono text-[10px] mt-1">
                                    correlation: {event.correlationId}
                                  </p>
                                )}
                              </div>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
