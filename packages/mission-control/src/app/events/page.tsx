'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { EventStream } from '@/components/event-stream';
import { api } from '@/lib/api';
import { useWebSocket } from '@/hooks/use-websocket';
import type { Event } from '@/lib/types';

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const { events: wsEvents, isConnected } = useWebSocket();

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await api.getEvents();
        setEvents(data as Event[]);
      } catch {
        console.error('Failed to fetch events');
      }
    };

    fetchEvents();
  }, []);

  // Merge WS events with fetched events
  const allEvents = [
    ...wsEvents,
    ...events.filter((e) => !wsEvents.some((we) => we.id === e.id)),
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 p-6 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Events</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time event stream</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-muted-foreground font-mono">
              {isConnected ? 'connected' : 'disconnected'}
            </span>
          </div>
        </div>

        <div className="flex-1 bg-card border border-border rounded-md p-4 min-h-0">
          <EventStream events={allEvents} />
        </div>
      </main>
    </div>
  );
}
