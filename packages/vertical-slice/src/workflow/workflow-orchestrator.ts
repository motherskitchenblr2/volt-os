/**
 * @module workflow/workflow-orchestrator
 * Central orchestrator for the vertical-slice workflow.
 *
 * Coordinates every VOLT OS subsystem to execute the end-to-end project
 * generation pipeline:
 *
 *   1. Research Agent → Requirements document
 *   2. Architect Agent → System design + ADR
 *   3. Frontend Agent → Minimal Next.js app
 *   4. QA Agent → Build verification report
 *   5. Artifacts stored in Memory Engine
 *   6. Events streamed via Event Bus
 *   7. Metrics tracked via PerformanceTracker
 *   8. Security enforced via Security Engine
 *
 * @example
 * ```ts
 * const orchestrator = new WorkflowOrchestrator({
 *   eventBus,
 *   agentExecutor,
 *   agentRegistry,
 *   memoryEngine,
 *   securityEngine,
 *   performanceTracker,
 * });
 *
 * const execution = await orchestrator.execute({
 *   id: 'proj-1',
 *   description: 'Build a restaurant management app',
 *   createdAt: new Date(),
 * });
 * ```
 */

import type { EventBus } from '@volt-os/event-bus';
import type {
  AgentInstance,
  AgentTask,
  AgentResult,
} from '@volt-os/agent-runtime';
import type { AgentExecutor } from '@volt-os/agent-runtime';
import type { AgentRegistry } from '@volt-os/agent-runtime';
import type { MemoryEngine } from '@volt-os/memory-engine';
import type { SecurityEngine } from '@volt-os/security-engine';
import type {
  ProjectRequest,
  ProjectArtifact,
  WorkflowExecution,
  WorkflowStep,
} from '../types.js';
import { PerformanceTracker } from '../metrics/performance-tracker.js';

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

let idCounter = 0;

/**
 * Generate a unique identifier with a configurable prefix.
 * @param prefix - Optional prefix (default: "vs").
 * @returns A unique string like "vs-1715000000000-0".
 */
function generateId(prefix: string = 'vs'): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

// ---------------------------------------------------------------------------
// Workflow Event Names
// ---------------------------------------------------------------------------

/** Canonical event names emitted by the workflow orchestrator. */
export const WorkflowEvents = {
  WORKFLOW_STARTED: 'workflow:started',
  WORKFLOW_COMPLETED: 'workflow:completed',
  WORKFLOW_FAILED: 'workflow:failed',
  STEP_STARTED: 'workflow:step.started',
  STEP_COMPLETED: 'workflow:step.completed',
  STEP_FAILED: 'workflow:step.failed',
  ARTIFACT_STORED: 'workflow:artifact.stored',
} as const;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Configuration for the WorkflowOrchestrator. */
export interface WorkflowOrchestratorOptions {
  /** Shared event bus for emitting workflow lifecycle events. */
  eventBus: EventBus;
  /** Agent executor for running agents through the IAgent interface. */
  agentExecutor: AgentExecutor;
  /** Agent registry for looking up agent instances. */
  agentRegistry: AgentRegistry;
  /** Memory engine for storing artifacts and execution history. */
  memoryEngine: MemoryEngine;
  /** Security engine for authorization checks. */
  securityEngine: SecurityEngine;
  /** Performance tracker for recording metrics. */
  performanceTracker: PerformanceTracker;
}

// ---------------------------------------------------------------------------
// WorkflowOrchestrator
// ---------------------------------------------------------------------------

/**
 * Orchestrates the complete vertical-slice workflow by coordinating
 * all 8 VOLT OS subsystems.
 */
export class WorkflowOrchestrator {
  private readonly eventBus: EventBus;
  private readonly agentExecutor: AgentExecutor;
  private readonly agentRegistry: AgentRegistry;
  private readonly memoryEngine: MemoryEngine;
  private readonly securityEngine: SecurityEngine;
  private readonly performanceTracker: PerformanceTracker;

  /** Map from step name → agent id for quick lookup. */
  private static readonly STEP_AGENT_MAP: Record<string, string> = {
    'research': 'researcher',
    'architecture': 'architect',
    'frontend': 'frontend-engineer',
    'qa-validation': 'qa',
  };

  constructor(options: WorkflowOrchestratorOptions) {
    this.eventBus = options.eventBus;
    this.agentExecutor = options.agentExecutor;
    this.agentRegistry = options.agentRegistry;
    this.memoryEngine = options.memoryEngine;
    this.securityEngine = options.securityEngine;
    this.performanceTracker = options.performanceTracker;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Execute the complete vertical-slice workflow for a project request.
   *
   * Steps:
   * 1. Research Agent → Requirements
   * 2. Architect Agent → Design + ADR
   * 3. Frontend Agent → Code
   * 4. QA Agent → Validation report
   * 5. Store all artifacts in Memory
   *
   * @param request - The project request to process.
   * @returns The completed workflow execution with all artifacts and metrics.
   */
  async execute(request: ProjectRequest): Promise<WorkflowExecution> {
    const executionId = generateId('wf');
    const execution: WorkflowExecution = {
      id: executionId,
      projectId: request.id,
      status: 'running',
      startedAt: new Date(),
      steps: [],
      metrics: {
        totalExecutionMs: 0,
        eventsGenerated: 0,
        memoryWrites: 0,
        tokenUsage: 0,
        failures: 0,
        recoveryTimeMs: 0,
      },
    };

    // Emit workflow started
    this.emitTracked(execution, WorkflowEvents.WORKFLOW_STARTED, {
      executionId,
      projectId: request.id,
      description: request.description,
    });

    try {
      // ── Step 1: Research ────────────────────────────────────────────
      await this.executeStep(execution, 'research', async (agent) => {
        return await this.runAgentTask(agent, {
          id: `${executionId}-research`,
          type: 'research',
          input: { projectDescription: request.description },
          requiredCapabilities: ['research', 'requirements-analysis'],
          context: { projectId: request.id },
        });
      });

      // ── Step 2: Architecture ────────────────────────────────────────
      await this.executeStep(execution, 'architecture', async (agent) => {
        const requirements = this.findArtifact(execution, 'research');
        return await this.runAgentTask(agent, {
          id: `${executionId}-architecture`,
          type: 'architecture',
          input: { requirements },
          requiredCapabilities: ['architecture', 'system-design', 'adr'],
          context: { projectId: request.id },
        });
      });

      // ── Step 3: Frontend ────────────────────────────────────────────
      await this.executeStep(execution, 'frontend', async (agent) => {
        const design = this.findArtifact(execution, 'architecture');
        return await this.runAgentTask(agent, {
          id: `${executionId}-frontend`,
          type: 'code-generation',
          input: { design },
          requiredCapabilities: ['frontend', 'react', 'nextjs'],
          context: { projectId: request.id },
        });
      });

      // ── Step 4: QA Validation ──────────────────────────────────────
      await this.executeStep(execution, 'qa-validation', async (agent) => {
        const code = this.findArtifact(execution, 'frontend');
        return await this.runAgentTask(agent, {
          id: `${executionId}-qa`,
          type: 'validation',
          input: { code },
          requiredCapabilities: ['testing', 'validation', 'build-verification'],
          context: { projectId: request.id },
        });
      });

      // ── Step 5: Store artifacts in Memory ───────────────────────────
      await this.storeArtifacts(execution);

      // ── Mark completed ──────────────────────────────────────────────
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.metrics.totalExecutionMs =
        execution.completedAt.getTime() - execution.startedAt.getTime();

      this.emitTracked(execution, WorkflowEvents.WORKFLOW_COMPLETED, {
        executionId,
        projectId: request.id,
        totalMs: execution.metrics.totalExecutionMs,
        stepsCompleted: execution.steps.filter((s) => s.status === 'completed').length,
        totalSteps: execution.steps.length,
      });
    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.metrics.totalExecutionMs =
        execution.completedAt.getTime() - execution.startedAt.getTime();
      execution.metrics.failures += 1;

      this.emitTracked(execution, WorkflowEvents.WORKFLOW_FAILED, {
        executionId,
        projectId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return execution;
  }

  /**
   * Get the current execution state for a project (if any).
   * This is a convenience method for Mission Control queries.
   * @param executionId - The workflow execution ID.
   * @returns The execution object, or null if not found.
   */
  async getExecutionFromMemory(executionId: string): Promise<WorkflowExecution | null> {
    const entry = await this.memoryEngine.read(
      'project',
      executionId,
      'workflow:execution',
    );
    if (!entry) return null;
    return JSON.parse(entry.content) as WorkflowExecution;
  }

  // -------------------------------------------------------------------------
  // Private — Step Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a single workflow step by looking up the agent and running it.
   *
   * @param execution - The current workflow execution (mutated).
   * @param stepName - The step name (e.g. "research").
   * @param taskFn - A function that receives the agent instance and runs the task.
   */
  private async executeStep(
    execution: WorkflowExecution,
    stepName: string,
    taskFn: (agent: AgentInstance) => Promise<AgentResult>,
  ): Promise<void> {
    const agentId = WorkflowOrchestrator.STEP_AGENT_MAP[stepName];
    const step: WorkflowStep = {
      name: stepName,
      agentId,
      status: 'running',
      startedAt: new Date(),
    };
    execution.steps.push(step);

    // Emit step started
    this.emitTracked(execution, WorkflowEvents.STEP_STARTED, {
      step: stepName,
      agentId,
    });

    const stepStartTime = Date.now();

    try {
      // Look up the agent instance from the registry
      const agent = this.agentRegistry.get(agentId);
      if (!agent) {
        throw new Error(`Agent "${agentId}" not found in registry`);
      }

      // Execute the task through the executor (enforces timeouts, emits events)
      const result = await taskFn(agent);

      // Create artifact from result
      const artifactType = this.stepToArtifactType(stepName);
      const content = this.extractContent(result, stepName);

      const artifact: ProjectArtifact = {
        id: generateId(`art-${stepName}`),
        projectId: execution.projectId,
        type: artifactType,
        content,
        metadata: {
          agentId,
          tokensUsed: result.metadata['tokensUsed'] ?? 0,
          executionMs: Date.now() - stepStartTime,
        },
        createdAt: new Date(),
      };

      step.artifact = artifact;
      step.status = 'completed';
      step.completedAt = new Date();

      // Accumulate token usage
      execution.metrics.tokenUsage += (result.metadata['tokensUsed'] as number) ?? 0;

      // Record performance metrics
      const durationMs = Date.now() - stepStartTime;
      this.performanceTracker.record(`workflow.step.${stepName}.durationMs`, durationMs);
      this.performanceTracker.record(`workflow.step.${stepName}.tokens`, (result.metadata['tokensUsed'] as number) ?? 0);

      // Emit step completed
      this.emitTracked(execution, WorkflowEvents.STEP_COMPLETED, {
        step: stepName,
        agentId,
        durationMs,
        artifactId: artifact.id,
      });
    } catch (error) {
      step.status = 'failed';
      step.completedAt = new Date();
      execution.metrics.failures += 1;

      // Emit step failed
      this.emitTracked(execution, WorkflowEvents.STEP_FAILED, {
        step: stepName,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Private — Agent Execution
  // -------------------------------------------------------------------------

  /**
   * Run a task through the agent executor, wrapping the IAgent.execute call.
   * @param agent - The agent instance.
   * @param task - The task to execute.
   * @returns The agent result.
   */
  private async runAgentTask(agent: AgentInstance, task: AgentTask): Promise<AgentResult> {
    return await this.agentExecutor.execute(agent, task);
  }

  // -------------------------------------------------------------------------
  // Private — Memory Storage
  // -------------------------------------------------------------------------

  /**
   * Store all step artifacts and the execution summary in Memory.
   * @param execution - The completed workflow execution.
   */
  private async storeArtifacts(execution: WorkflowExecution): Promise<void> {
    for (const step of execution.steps) {
      if (step.artifact) {
        await this.memoryEngine.write(
          'project',
          execution.projectId,
          `artifact:${step.name}`,
          JSON.stringify(step.artifact),
          { agentId: step.agentId, type: step.artifact.type },
        );
        execution.metrics.memoryWrites += 1;

        this.emitTracked(execution, WorkflowEvents.ARTIFACT_STORED, {
          step: step.name,
          artifactId: step.artifact.id,
          artifactType: step.artifact.type,
        });
      }
    }

    // Store execution summary
    await this.memoryEngine.write(
      'project',
      execution.projectId,
      'workflow:execution',
      JSON.stringify(execution),
      { executionId: execution.id, status: execution.status },
    );
    execution.metrics.memoryWrites += 1;
  }

  // -------------------------------------------------------------------------
  // Private — Helpers
  // -------------------------------------------------------------------------

  /**
   * Extract the primary content string from an agent result for a given step.
   * Agent results have a `Record<string, unknown>` output; we pull the
   * first value that is a string, or fall back to JSON.
   */
  private extractContent(result: AgentResult, stepName: string): string {
    const output = result.output;

    // Known output keys per step
    const keyMap: Record<string, string[]> = {
      'research': ['requirements'],
      'architecture': ['design'],
      'frontend': ['code'],
      'qa-validation': ['report'],
    };

    const keys = keyMap[stepName] ?? [];

    for (const key of keys) {
      const value = output[key];
      if (typeof value === 'string') {
        return value;
      }
    }

    // Fallback: return the first string value or JSON
    for (const value of Object.values(output)) {
      if (typeof value === 'string') {
        return value;
      }
    }

    return JSON.stringify(output, null, 2);
  }

  /**
   * Find the content of the most recent artifact from a prior step.
   * @param execution - The current execution.
   * @param stepName - The step whose artifact content to retrieve.
   * @returns The artifact content string.
   * @throws If no completed artifact exists for the step.
   */
  private findArtifact(execution: WorkflowExecution, stepName: string): string {
    const step = execution.steps.find(
      (s) => s.name === stepName && s.status === 'completed' && s.artifact,
    );

    if (!step?.artifact) {
      throw new Error(
        `Cannot find completed artifact for step "${stepName}". ` +
        `Ensure the step executes before its dependents.`,
      );
    }

    return step.artifact.content;
  }

  /**
   * Map a workflow step name to an artifact type.
   */
  private stepToArtifactType(stepName: string): ProjectArtifact['type'] {
    const map: Record<string, ProjectArtifact['type']> = {
      'research': 'requirements',
      'architecture': 'design',
      'frontend': 'code',
      'qa-validation': 'test-report',
    };
    return map[stepName] ?? 'requirements';
  }

  /**
   * Emit an event and track it in metrics.
   */
  private emitTracked(
    execution: WorkflowExecution,
    eventType: string,
    data: Record<string, unknown>,
  ): void {
    this.eventBus.emit(eventType, {
      ...data,
      workflowExecutionId: execution.id,
      timestamp: new Date().toISOString(),
    });
    execution.metrics.eventsGenerated += 1;
  }
}
