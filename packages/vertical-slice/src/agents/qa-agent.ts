/**
 * @module agents/qa-agent
 * QA Agent — implements IAgent v1.0 for the vertical-slice workflow.
 *
 * Consumes generated source code and produces a validation / test report.
 * In production this would run actual build verification; here the output
 * is deterministic for testing.
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
 * QA Agent — validates code and produces test reports.
 */
export class QAAgent implements IAgent {
  /** Agent identifier matching the manifest. */
  readonly id = 'qa';

  /** Capabilities this agent provides. */
  readonly capabilities = ['testing', 'validation', 'build-verification'];

  private logger!: PluginLogger;
  private initialized = false;
  private startedAt: Date | null = null;

  async initialize(context: AgentContext): Promise<void> {
    this.logger = context.logger;
    this.initialized = true;
    this.startedAt = new Date();
    this.logger.info('QAAgent initialized');
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (!this.initialized) {
      throw new Error('QAAgent must be initialized before execution');
    }

    const code = task.input['code'] as string;

    if (!code || typeof code !== 'string') {
      throw new Error('task.input.code is required and must be a string');
    }

    this.logger.info('Executing QA validation task', { taskId: task.id });

    const report = this.generateReport(code);

    this.logger.info('QA task complete', { taskId: task.id, tokensUsed: 100 });

    return {
      status: 'completed',
      output: { report },
      artifacts: [],
      memoryUpdates: [],
      metadata: {
        tokensUsed: 100,
        agentId: this.id,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async validate(task: AgentTask): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!task.input['code']) {
      errors.push('Missing required input: code');
    }

    if (task.input['code'] && typeof task.input['code'] !== 'string') {
      errors.push('Input code must be a string');
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
    this.logger?.info('QAAgent shut down');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateReport(_code: string): string {
    return [
      '# QA Validation Report',
      '',
      '## Build Verification: ✅ PASSED',
      '',
      '### Checks',
      '- [x] TypeScript compiles',
      '- [x] No lint errors',
      '- [x] Tests pass',
      '- [x] Build succeeds',
      '- [x] No security vulnerabilities',
      '',
      '### Metrics',
      '- Test coverage: 85%',
      '- Build time: 12s',
      '- Bundle size: 145KB',
      '',
    ].join('\n');
  }
}
