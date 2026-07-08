/**
 * @module agents/frontend-agent
 * Frontend Agent — implements IAgent v1.0 for the vertical-slice workflow.
 *
 * Consumes a system design document and produces minimal Next.js application
 * source code. In production this would use Model Router; here the output
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
 * Frontend Agent — generates Next.js application code from a design.
 */
export class FrontendAgent implements IAgent {
  /** Agent identifier matching the manifest. */
  readonly id = 'frontend-engineer';

  /** Capabilities this agent provides. */
  readonly capabilities = ['frontend', 'react', 'nextjs'];

  private logger!: PluginLogger;
  private initialized = false;
  private startedAt: Date | null = null;

  async initialize(context: AgentContext): Promise<void> {
    this.logger = context.logger;
    this.initialized = true;
    this.startedAt = new Date();
    this.logger.info('FrontendAgent initialized');
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    if (!this.initialized) {
      throw new Error('FrontendAgent must be initialized before execution');
    }

    const design = task.input['design'] as string;

    if (!design || typeof design !== 'string') {
      throw new Error('task.input.design is required and must be a string');
    }

    this.logger.info('Executing frontend code generation task', { taskId: task.id });

    const code = this.generateCode(design);

    this.logger.info('Frontend task complete', { taskId: task.id, tokensUsed: 300 });

    return {
      status: 'completed',
      output: { code },
      artifacts: [],
      memoryUpdates: [],
      metadata: {
        tokensUsed: 300,
        agentId: this.id,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async validate(task: AgentTask): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!task.input['design']) {
      errors.push('Missing required input: design');
    }

    if (task.input['design'] && typeof task.input['design'] !== 'string') {
      errors.push('Input design must be a string');
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
    this.logger?.info('FrontendAgent shut down');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateCode(_design: string): string {
    return [
      '// Generated Next.js Application',
      '// package.json',
      '{',
      '  "name": "generated-app",',
      '  "version": "0.1.0",',
      '  "dependencies": {',
      '    "next": "^14.2.0",',
      '    "react": "^19.0.0"',
      '  }',
      '}',
      '',
      '// src/app/page.tsx',
      'export default function Home() {',
      '  return (',
      '    <main>',
      '      <h1>Generated Application</h1>',
      '      <p>Architecture: Modular Monolith</p>',
      '    </main>',
      '  );',
      '}',
      '',
    ].join('\n');
  }
}
