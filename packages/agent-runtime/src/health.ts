/**
 * @module health
 * Health monitor — periodically checks agent health status and detects
 * unhealthy agents that may need recovery or disabling.
 */

import type {
  EventBus,
} from '@volt-os/plugin-runtime';
import type {
  AgentInstance,
  AgentHealthStatus,
} from './types.js';
import type { IAgent } from './agent/agent-interface.js';
import { AgentEvents } from './types.js';
import { AgentRegistry } from './registry.js';

/** Default health check interval in milliseconds. */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Monitors agent health through periodic heartbeat checks.
 * Detects degraded or unhealthy agents and emits appropriate events.
 */
export class AgentHealthMonitor {
  /** Event bus for health events. */
  private readonly eventBus: EventBus;
  /** Agent registry for looking up agents. */
  private readonly registry: AgentRegistry;
  /** Health check interval in milliseconds. */
  private readonly intervalMs: number;
  /** Timer handle for the periodic health check. */
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  /** Agent implementations for calling heartbeat. */
  private readonly implementations = new Map<string, IAgent>();
  /** Health status history per agent. */
  private readonly healthHistory = new Map<string, AgentHealthStatus>();

  constructor(options: {
    eventBus: EventBus;
    registry: AgentRegistry;
    intervalMs?: number;
  }) {
    this.eventBus = options.eventBus;
    this.registry = options.registry;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /**
   * Register an agent implementation for health monitoring.
   * @param agentId - The agent identifier.
   * @param impl - The IAgent implementation.
   */
  registerImplementation(agentId: string, impl: IAgent): void {
    this.implementations.set(agentId, impl);
  }

  /**
   * Remove a registered agent implementation.
   * @param agentId - The agent identifier.
   */
  unregisterImplementation(agentId: string): void {
    this.implementations.delete(agentId);
    this.healthHistory.delete(agentId);
  }

  /**
   * Start periodic health monitoring for all registered agents.
   */
  start(): void {
    if (this.intervalHandle !== null) {
      return; // Already running
    }

    this.intervalHandle = setInterval(() => {
      void this.checkAll();
    }, this.intervalMs);
  }

  /**
   * Stop periodic health monitoring.
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Check the health of a specific agent.
   * @param agentId - The agent to check.
   * @returns The agent's health status.
   * @throws If the agent is not found.
   */
  async checkAgent(agentId: string): Promise<AgentHealthStatus> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const now = new Date();
    const impl = this.implementations.get(agentId);

    if (!impl) {
      // No implementation — mark as unhealthy
      const status: AgentHealthStatus = {
        status: 'unhealthy',
        lastCheck: now,
        consecutiveFailures: (agent.health.consecutiveFailures) + 1,
        uptime: agent.loadedAt ? now.getTime() - agent.loadedAt.getTime() : 0,
      };

      agent.health = status;
      this.healthHistory.set(agentId, status);
      this.eventBus.emit(AgentEvents.AGENT_UNHEALTHY, {
        agentId,
        reason: 'No implementation registered',
      });
      return status;
    }

    try {
      const healthStatus = await impl.heartbeat();

      const prevHealth = this.healthHistory.get(agentId);
      const consecutiveFailures = healthStatus.status === 'healthy' ? 0 :
        (prevHealth?.consecutiveFailures ?? 0) + 1;

      const status: AgentHealthStatus = {
        status: consecutiveFailures >= agent.manifest.healthChecks.failureThreshold
          ? 'unhealthy'
          : consecutiveFailures > 0
            ? 'degraded'
            : 'healthy',
        lastCheck: now,
        consecutiveFailures,
        uptime: agent.loadedAt ? now.getTime() - agent.loadedAt.getTime() : 0,
      };

      agent.health = status;
      this.healthHistory.set(agentId, status);

      this.eventBus.emit(AgentEvents.AGENT_HEALTH_CHECK, {
        agentId,
        status: status.status,
        consecutiveFailures: status.consecutiveFailures,
      });

      if (status.status === 'unhealthy') {
        this.eventBus.emit(AgentEvents.AGENT_UNHEALTHY, {
          agentId,
          consecutiveFailures: status.consecutiveFailures,
        });
      }

      return status;
    } catch (error) {
      const prevHealth = this.healthHistory.get(agentId);
      const consecutiveFailures = (prevHealth?.consecutiveFailures ?? 0) + 1;

      const status: AgentHealthStatus = {
        status: consecutiveFailures >= agent.manifest.healthChecks.failureThreshold
          ? 'unhealthy'
          : 'degraded',
        lastCheck: now,
        consecutiveFailures,
        uptime: agent.loadedAt ? now.getTime() - agent.loadedAt.getTime() : 0,
      };

      agent.health = status;
      this.healthHistory.set(agentId, status);

      this.eventBus.emit(AgentEvents.AGENT_HEALTH_CHECK, {
        agentId,
        status: status.status,
        consecutiveFailures: status.consecutiveFailures,
      });

      if (status.status === 'unhealthy') {
        this.eventBus.emit(AgentEvents.AGENT_UNHEALTHY, {
          agentId,
          error: error instanceof Error ? error.message : String(error),
          consecutiveFailures: status.consecutiveFailures,
        });
      }

      return status;
    }
  }

  /**
   * Check health of all registered agents that have implementations.
   * @returns Map of agent id to health status.
   */
  async checkAll(): Promise<Map<string, AgentHealthStatus>> {
    const results = new Map<string, AgentHealthStatus>();

    for (const agent of this.registry.list()) {
      if (this.implementations.has(agent.id)) {
        const status = await this.checkAgent(agent.id);
        results.set(agent.id, status);
      }
    }

    return results;
  }

  /**
   * Get all agents that are currently unhealthy.
   * @returns Array of unhealthy agent instances.
   */
  getUnhealthy(): AgentInstance[] {
    return this.registry.list().filter(
      (agent) => agent.health.status === 'unhealthy',
    );
  }

  /**
   * Get the health history for a specific agent.
   * @param agentId - The agent id.
   * @returns The last recorded health status, or undefined.
   */
  getHealthHistory(agentId: string): AgentHealthStatus | undefined {
    return this.healthHistory.get(agentId);
  }

  /**
   * Get the count of monitored agents.
   * @returns Number of agents being monitored.
   */
  count(): number {
    return this.implementations.size;
  }
}
