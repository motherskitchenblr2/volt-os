// Shared types for Mission Control v0

export interface PlatformHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceStatus[];
  uptime: number;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
}

export interface Pipeline {
  id: string;
  name: string;
  status: 'running' | 'waiting_approval' | 'failed' | 'completed';
  startedAt: string;
  completedAt?: string;
  tasks: PipelineTask[];
}

export interface PipelineTask {
  id: string;
  name: string;
  status: string;
  agentId?: string;
}

export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  health: 'healthy' | 'degraded' | 'unhealthy';
  lastExecution?: string;
  capabilities: string[];
  currentTasks: string[];
}

export interface Event {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  timestamp: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}
