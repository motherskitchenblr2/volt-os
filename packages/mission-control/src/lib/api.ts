// API client and React Query hooks for Mission Control v0
// READ ONLY — no mutations, no admin actions

import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { PlatformHealth, Pipeline, Agent, Event } from '@/lib/types';

const API_BASE = 'http://localhost:3333/api';

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Raw API client (kept for backward compatibility)
// ---------------------------------------------------------------------------

export const api = {
  getHealth: () =>
    fetchApi<PlatformHealth>('/health'),
  getPipelines: () =>
    fetchApi<Pipeline[]>('/pipelines'),
  getAgents: () =>
    fetchApi<Agent[]>('/agents'),
  getEvents: () =>
    fetchApi<Event[]>('/events'),
};

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const queryKeys = {
  health: ['health'] as const,
  pipelines: ['pipelines'] as const,
  agents: ['agents'] as const,
  events: ['events'] as const,
} as const;

// ---------------------------------------------------------------------------
// React Query hooks (all read-only)
// ---------------------------------------------------------------------------

/** Fetch platform health status. Refetches every 10 s. */
export function useHealthQuery(): UseQueryResult<PlatformHealth> {
  return useQuery<PlatformHealth>({
    queryKey: queryKeys.health,
    queryFn: () => api.getHealth(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/** Fetch all pipelines. Refetches every 5 s. */
export function usePipelinesQuery(): UseQueryResult<Pipeline[]> {
  return useQuery<Pipeline[]>({
    queryKey: queryKeys.pipelines,
    queryFn: () => api.getPipelines(),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

/** Fetch all agents. Refetches every 5 s. */
export function useAgentsQuery(): UseQueryResult<Agent[]> {
  return useQuery<Agent[]>({
    queryKey: queryKeys.agents,
    queryFn: () => api.getAgents(),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

/** Fetch historical events. No auto-refetch (live events arrive via WebSocket). */
export function useEventsQuery(): UseQueryResult<Event[]> {
  return useQuery<Event[]>({
    queryKey: queryKeys.events,
    queryFn: () => api.getEvents(),
    staleTime: 60_000,
  });
}
