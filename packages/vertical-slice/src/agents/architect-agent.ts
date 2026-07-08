/**
 * @module agents/architect-agent
 * Architect Agent — implements IAgent v1.0 for the vertical-slice workflow.
 *
 * Consumes a requirements document and produces a system design document
 * with an Architecture Decision Record (ADR). In production this would
 * use Model Router; here the output is deterministic for testing.
 */

import type {
  AgentContext,
  AgentTask,
  AgentResult,
  AgentHealthStatus,
} from '@volt-os/agent-runtime';
import type { IAgent } from '@volt-os/agent-runtime';
import type { PluginLogger } from '@volt-os/plugin-runtime';

/**
 * Architect Agent — produces system designs and ADRs from requirements.
 */
export class ArchitectAgent implements IAgent {
  /** Agent identifier matching the manifest. */
  readonly id = 'architect';

  /** Capabilities this agent provides. */
  readonly capabilities = ['architecture', 'system-design', 'adr'];

  private logger!: PluginLogger;
  private initialized = false;
  private startedAt: Date | null = null;

  async initialize(context: AgentContext): Promise<void> {
    this.logger = context.logger;
    this.initialized = true;
    this.startedAt = new Date();
    this.logger.info('ArchitectAgent initialized');
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (!this.initialized) {
      throw new Error('ArchitectAgent must be initialized before execution');
    }

    const requirements = task.input['requirements'] as string;

    if (!requirements || typeof requirements !== 'string') {
      throw new Error('task.input.requirements is required and must be a string');
    }

    this.logger.info('Executing architecture task', { taskId: task.id });

    const design = this.generateDesign(requirements);

    this.logger.info('Architecture task complete', { taskId: task.id, tokensUsed: 200 });

    return {
      status: 'completed',
      output: { design },
      artifacts: [],
      memoryUpdates: [],
      metadata: {
        tokensUsed: 200,
        agentId: this.id,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async validate(task: AgentTask): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!task.input['requirements']) {
      errors.push('Missing required input: requirements');
    }

    if (task.input['requirements'] && typeof task.input['requirements'] !== 'string') {
      errors.push('Input requirements must be a string');
    }

    return { valid: errors.length === 0, errors };
  }

  async heartbeat(): Promise<AgentHealthStatus> {
    return {
      status: this.initialized ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      consecutiveFailures: 0,
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
    };
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.logger?.info('ArchitectAgent shut down');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateDesign(_requirements: string): string {
    return [
      '# System Design',
      '',
      '## Architecture: Modular Monolith',
      '',
      '### Components',
      '1. **Auth Service** — JWT + OAuth',
      '2. **Core Service** — Business logic',
      '3. **API Gateway** — Fastify',
      '4. **Event Bus** — In-process + Redis',
      '5. **Memory Store** — PostgreSQL + pgvector',
      '',
      '### ADR-001: Modular Monolith',
      '- **Decision**: Use modular monolith for Phase 1',
      '- **Rationale**: Faster development, easier debugging, simpler deployment',
      '- **Consequences**: Extraction path defined for microservices later',
      '',
    ].join('\n');
  }
}
