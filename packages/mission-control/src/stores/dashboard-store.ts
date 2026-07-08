import { create } from 'zustand';
import type { PlatformHealth, Pipeline, Agent, Event } from '@/lib/types';

interface DashboardState {
  // Health
  health: PlatformHealth | null;
  healthLoading: boolean;

  // Pipelines
  pipelines: Pipeline[];
  pipelinesLoading: boolean;

  // Agents
  agents: Agent[];
  agentsLoading: boolean;

  // Events
  events: Event[];
  eventsLoading: boolean;
  eventFilter: string;
  eventSearch: string;

  // Actions (READ ONLY — no mutations, no admin actions)
  setHealth: (health: PlatformHealth) => void;
  setHealthLoading: (loading: boolean) => void;
  setPipelines: (pipelines: Pipeline[]) => void;
  setPipelinesLoading: (loading: boolean) => void;
  setAgents: (agents: Agent[]) => void;
  setAgentsLoading: (loading: boolean) => void;
  addEvent: (event: Event) => void;
  setEvents: (events: Event[]) => void;
  setEventsLoading: (loading: boolean) => void;
  setEventFilter: (filter: string) => void;
  setEventSearch: (search: string) => void;
  clearEvents: () => void;
}

/** Max events stored in the buffer (FIFO) */
const MAX_EVENTS = 1000;

export const useDashboardStore = create<DashboardState>((set) => ({
  // Health
  health: null,
  healthLoading: true,

  // Pipelines
  pipelines: [],
  pipelinesLoading: true,

  // Agents
  agents: [],
  agentsLoading: true,

  // Events
  events: [],
  eventsLoading: true,
  eventFilter: '',
  eventSearch: '',

  // --- Actions (READ ONLY) ---

  setHealth: (health) => set({ health, healthLoading: false }),
  setHealthLoading: (loading) => set({ healthLoading: loading }),

  setPipelines: (pipelines) => set({ pipelines, pipelinesLoading: false }),
  setPipelinesLoading: (loading) => set({ pipelinesLoading: loading }),

  setAgents: (agents) => set({ agents, agentsLoading: false }),
  setAgentsLoading: (loading) => set({ agentsLoading: loading }),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
      eventsLoading: false,
    })),

  setEvents: (events) =>
    set({ events: events.slice(0, MAX_EVENTS), eventsLoading: false }),

  setEventsLoading: (loading) => set({ eventsLoading: loading }),

  setEventFilter: (filter) => set({ eventFilter: filter }),
  setEventSearch: (search) => set({ eventSearch: search }),

  clearEvents: () => set({ events: [], eventsLoading: false }),
}));
