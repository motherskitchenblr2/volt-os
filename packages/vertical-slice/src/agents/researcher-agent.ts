/**
 * @module agents/researcher-agent
 * Research Agent — implements IAgent v1.0 for the vertical-slice workflow.
 *
 * Consumes a project description and produces a structured requirements
 * document. In production this agent would call Model Router for LLM
 * inference; here it produces deterministic output for testing.
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
 * Research Agent — produces requirements documents from project descriptions.
 */
export class ResearcherAgent implements IAgent {
  /** Agent identifier matching the manifest. */
  readonly id = 'researcher';

  /** Capabilities this agent provides. */
  readonly capabilities = ['research', 'requirements-analysis'];

  private logger!: PluginLogger;
  private initialized = false;
  private startedAt: Date | null = null;

  async initialize(context: AgentContext): Promise<void> {
    this.logger = context.logger;
    this.initialized = true;
    this.startedAt = new Date();
    this.logger.info('ResearcherAgent initialized');
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (!this.initialized) {
      throw new Error('ResearcherAgent must be initialized before execution');
    }

    const projectDescription = task.input['projectDescription'] as string;

    if (!projectDescription || typeof projectDescription !== 'string') {
      throw new Error('task.input.projectDescription is required and must be a string');
    }

    this.logger.info('Executing research task', { taskId: task.id });

    const requirements = this.generateRequirements(projectDescription);

    this.logger.info('Research task complete', { taskId: task.id, tokensUsed: 150 });

    return {
      status: 'completed',
      output: { requirements },
      artifacts: [],
      memoryUpdates: [],
      metadata: {
        tokensUsed: 150,
        agentId: this.id,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async validate(task: AgentTask): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!task.input['projectDescription']) {
      errors.push('Missing required input: projectDescription');
    }

    if (task.input['projectDescription'] && typeof task.input['projectDescription'] !== 'string') {
      errors.push('Input projectDescription must be a string');
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
    this.logger?.info('ResearcherAgent shut down');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateRequirements(projectDescription: string): string {
    return [
      '# Requirements Document',
      '',
      `## Project: ${projectDescription}`,
      '',
      '### Functional Requirements',
      '1. User authentication and authorization',
      '2. Dashboard with key metrics',
      '3. CRUD operations for core entities',
      '4. Reporting and analytics',
      '5. Real-time notifications',
      '',
      '### Non-Functional Requirements',
      '1. Response time < 200ms',
      '2. 99.9% uptime',
      '3. Support 1000+ concurrent users',
      '4. GDPR compliant data handling',
      '',
      '### Technical Requirements',
      '1. Next.js 14 with App Router',
      '2. PostgreSQL 16',
      '3. Redis for caching',
      '4. TypeScript strict mode',
      '',
    ].join('\n');
  }
}
