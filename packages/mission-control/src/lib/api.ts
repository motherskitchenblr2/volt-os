// API client for Mission Control

const API_BASE = 'http://localhost:3333/api';

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export const api = {
  getHealth: () => fetchApi<{ status: string; services: Array<{ name: string; status: string; lastCheck: string }>; uptime: number }>('/health'),
  getPipelines: () => fetchApi<Array<{ id: string; name: string; status: string; startedAt: string; completedAt?: string; tasks: Array<{ id: string; name: string; status: string; agentId?: string }> }>>('/pipelines'),
  getAgents: () => fetchApi<Array<{ id: string; name: string; status: string; health: string; lastExecution?: string; capabilities: string[]; currentTasks: string[] }>>('/agents'),
  getEvents: () => fetchApi<Array<{ id: string; type: string; severity: string; timestamp: string; payload: Record<string, unknown>; correlationId?: string }>>('/events'),
};
