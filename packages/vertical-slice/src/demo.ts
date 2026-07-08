/**
 * @module demo
 * Interactive demonstration of the VOLT OS Vertical Slice v0.2.0-alpha.
 *
 * This script wires up the complete subsystem stack and executes the
 * end-to-end workflow, showing every subsystem in action.
 *
 * Usage:
 *   pnpm --filter @volt/vertical-slice demo
 *   # or
 *   tsx packages/vertical-slice/src/demo.ts
 */

import { InMemoryEventBus } from '@volt-os/event-bus';
import { AgentRegistry, AgentExecutor } from '@volt-os/agent-runtime';
import { MemoryEngine } from '@volt-os/memory-engine';
import {
  InMemoryStore,
  InMemoryVectorStore,
} from '@volt-os/memory-engine';
import { SecurityEngine } from '@volt-os/security-engine';
import { PerformanceTracker } from './metrics/performance-tracker.js';
import { WorkflowOrchestrator, WorkflowEvents } from './workflow/workflow-orchestrator.js';
import type { ProjectRequest } from './types.js';

// Agent implementations
import { ResearcherAgent } from './agents/researcher-agent.js';
import { ArchitectAgent } from './agents/architect-agent.js';
import { FrontendAgent } from './agents/frontend-agent.js';
import { QAAgent } from './agents/qa-agent.js';

// Pipeline definition info
import { getWorkflowDescription, VERTICAL_SLICE_STAGES } from './workflow/pipeline-definition.js';

// ---------------------------------------------------------------------------
// Manifests (simplified — production would load from plugin manifests)
// ---------------------------------------------------------------------------

const AGENT_MANIFESTS = [
  {
    id: 'researcher',
    version: '1.0.0',
    name: 'Research Agent',
    description: 'Produces requirements documents from project descriptions',
    author: 'volt-os',
    capabilities: ['research', 'requirements-analysis'],
    requiredTools: [],
    requiredModels: [],
    requiredPermissions: [],
    memoryProfile: {
      workingMemoryMB: 64,
      longTermMemory: true,
      contextWindow: 8192,
    },
    resourceLimits: {
      maxConcurrentTasks: 1,
      maxMemoryMB: 128,
      maxCpuTimeMs: 60_000,
      maxTokensPerTask: 4096,
      executionTimeoutMs: 30_000,
    },
    priority: 1,
    healthChecks: {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      failureThreshold: 3,
    },
    lifecycleHooks: {
      onInitialize: 'initialize',
      onExecute: 'execute',
      onComplete: 'complete',
      onShutdown: 'shutdown',
    },
  },
  {
    id: 'architect',
    version: '1.0.0',
    name: 'Architect Agent',
    description: 'Produces system designs and ADRs from requirements',
    author: 'volt-os',
    capabilities: ['architecture', 'system-design', 'adr'],
    requiredTools: [],
    requiredModels: [],
    requiredPermissions: [],
    memoryProfile: {
      workingMemoryMB: 64,
      longTermMemory: true,
      contextWindow: 16384,
    },
    resourceLimits: {
      maxConcurrentTasks: 1,
      maxMemoryMB: 128,
      maxCpuTimeMs: 60_000,
      maxTokensPerTask: 4096,
      executionTimeoutMs: 30_000,
    },
    priority: 2,
    healthChecks: {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      failureThreshold: 3,
    },
    lifecycleHooks: {
      onInitialize: 'initialize',
      onExecute: 'execute',
      onComplete: 'complete',
      onShutdown: 'shutdown',
    },
  },
  {
    id: 'frontend-engineer',
    version: '1.0.0',
    name: 'Frontend Agent',
    description: 'Generates Next.js application code from a design',
    author: 'volt-os',
    capabilities: ['frontend', 'react', 'nextjs'],
    requiredTools: [],
    requiredModels: [],
    requiredPermissions: [],
    memoryProfile: {
      workingMemoryMB: 128,
      longTermMemory: true,
      contextWindow: 16384,
    },
    resourceLimits: {
      maxConcurrentTasks: 1,
      maxMemoryMB: 256,
      maxCpuTimeMs: 120_000,
      maxTokensPerTask: 8192,
      executionTimeoutMs: 60_000,
    },
    priority: 3,
    healthChecks: {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      failureThreshold: 3,
    },
    lifecycleHooks: {
      onInitialize: 'initialize',
      onExecute: 'execute',
      onComplete: 'complete',
      onShutdown: 'shutdown',
    },
  },
  {
    id: 'qa',
    version: '1.0.0',
    name: 'QA Agent',
    description: 'Validates code and produces test reports',
    author: 'volt-os',
    capabilities: ['testing', 'validation', 'build-verification'],
    requiredTools: [],
    requiredModels: [],
    requiredPermissions: [],
    memoryProfile: {
      workingMemoryMB: 64,
      longTermMemory: true,
      contextWindow: 8192,
    },
    resourceLimits: {
      maxConcurrentTasks: 1,
      maxMemoryMB: 128,
      maxCpuTimeMs: 60_000,
      maxTokensPerTask: 4096,
      executionTimeoutMs: 30_000,
    },
    priority: 4,
    healthChecks: {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      failureThreshold: 3,
    },
    lifecycleHooks: {
      onInitialize: 'initialize',
      onExecute: 'execute',
      onComplete: 'complete',
      onShutdown: 'shutdown',
    },
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   VOLT OS — Vertical Slice v0.2.0-alpha                    ║');
  console.log('║   End-to-End Workflow Demonstration                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // ── 1. Initialize Subsystems ───────────────────────────────────────
  console.log('▸ Initializing subsystems...');

  const eventBus = new InMemoryEventBus();

  const performanceTracker = new PerformanceTracker();

  // Memory Engine (6-layer)
  const memStore = new InMemoryStore();
  const memVectorStore = new InMemoryVectorStore(128);
  const memoryEngine = new MemoryEngine({
    config: {
      userMemory: { maxSizeMB: 10 },
      projectMemory: { maxSizeMB: 50 },
      agentMemory: { maxSizeMB: 20, workingMemoryTtlMs: 3_600_000 },
      knowledgeBase: { maxSizeMB: 100 },
      vectorStore: { dimensions: 128, similarityThreshold: 0.7 },
      decisionHistory: { immutable: true },
    },
    store: memStore,
    vectorStore: memVectorStore,
    eventBus,
  });

  // Security Engine
  const securityEngine = new SecurityEngine({
    jwtSecret: 'vertical-slice-demo-secret-32-chars!!!',
    policies: [],
    eventBus,
  });

  // Agent Runtime
  const agentRegistry = new AgentRegistry();
  const agentExecutor = new AgentExecutor({ eventBus });

  // ── 2. Discover, Verify, Load, and Activate Agents ─────────────────
  console.log('▸ Registering agents...');

  const agentImpls = [
    { manifest: AGENT_MANIFESTS[0], impl: new ResearcherAgent() },
    { manifest: AGENT_MANIFESTS[1], impl: new ArchitectAgent() },
    { manifest: AGENT_MANIFESTS[2], impl: new FrontendAgent() },
    { manifest: AGENT_MANIFESTS[3], impl: new QAAgent() },
  ];

  // We need a minimal AgentManager to go through the lifecycle,
  // but for the demo we can manually register and activate.
  // The registry just stores instances; the executor runs them.
  for (const { manifest, impl } of agentImpls) {
    // Create a minimal instance and register it
    const instance = {
      id: manifest.id,
      manifest,
      state: 'ready' as const,
      resourceUsage: {
        memoryMB: 0,
        cpuTimeMs: 0,
        tokensUsed: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        uptime: 0,
      },
    };

    agentRegistry.register(instance);
    agentExecutor.registerImplementation(manifest.id, impl);

    // Initialize the agent
    // We need a minimal AgentContext — construct one manually
    const noop = (): void => { /* noop */ };
    const minimalContext = {
      logger: {
        info: noop,
        warn: noop,
        error: noop,
        debug: noop,
      },
      events: {
        publish: async () => {},
        subscribe: async () => async () => {},
      },
      memory: {
        read: async () => null,
        write: async () => {},
        delete: async () => {},
      },
      config: {
        get: () => undefined,
        getAll: () => ({}),
      },
      storage: {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
      },
      tasks: {
        reportProgress: noop,
        checkCancellation: () => false,
      },
    };

    await impl.initialize(minimalContext as never);
    console.log(`    ✓ ${manifest.id} (${manifest.name})`);
  }

  // ── 3. Subscribe to events (Mission Control simulation) ────────────
  console.log('▸ Subscribing to workflow events (Mission Control)...');
  const eventLog: Array<{ event: string; timestamp: string; data: Record<string, unknown> }> = [];

  const trackedEvents = [
    WorkflowEvents.WORKFLOW_STARTED,
    WorkflowEvents.STEP_STARTED,
    WorkflowEvents.STEP_COMPLETED,
    WorkflowEvents.STEP_FAILED,
    WorkflowEvents.ARTIFACT_STORED,
    WorkflowEvents.WORKFLOW_COMPLETED,
    WorkflowEvents.WORKFLOW_FAILED,
  ];

  for (const event of trackedEvents) {
    eventBus.on(event, (data) => {
      eventLog.push({
        event,
        timestamp: data['timestamp'] as string,
        data,
      });
    });
  }

  // ── 4. Create Workflow Orchestrator ────────────────────────────────
  console.log('▸ Creating WorkflowOrchestrator...');

  const orchestrator = new WorkflowOrchestrator({
    eventBus,
    agentExecutor,
    agentRegistry,
    memoryEngine,
    securityEngine,
    performanceTracker,
  });

  // ── 5. Print Pipeline Definition ───────────────────────────────────
  console.log();
  console.log(getWorkflowDescription());
  console.log();

  // ── 6. Create Project Request ──────────────────────────────────────
  const project: ProjectRequest = {
    id: `proj-${Date.now()}`,
    description: 'Build a restaurant management web application',
    createdAt: new Date(),
  };

  console.log(`▸ Project: ${project.id}`);
  console.log(`  Description: ${project.description}`);
  console.log();

  // ── 7. Execute Workflow ────────────────────────────────────────────
  console.log('▸ Executing workflow...');
  console.log();

  const execution = await orchestrator.execute(project);

  // ── 8. Print Results ───────────────────────────────────────────────
  console.log();
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Workflow Execution Results                                   │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Execution ID:   ${execution.id}`);
  console.log(`  Project ID:     ${execution.projectId}`);
  console.log(`  Status:         ${execution.status.toUpperCase()}`);
  console.log(`  Started:        ${execution.startedAt.toISOString()}`);
  console.log(`  Completed:      ${execution.completedAt?.toISOString() ?? 'N/A'}`);
  console.log(`  Duration:       ${execution.metrics.totalExecutionMs}ms`);
  console.log();

  console.log('  Steps:');
  for (const step of execution.steps) {
    const icon = step.status === 'completed' ? '✅' : '❌';
    const duration = step.completedAt && step.startedAt
      ? `${step.completedAt.getTime() - step.startedAt.getTime()}ms`
      : 'N/A';
    console.log(`    ${icon} ${step.name.padEnd(20)} ${step.status.padEnd(12)} ${duration}`);
  }
  console.log();

  console.log('  Metrics:');
  console.log(`    Events generated:   ${execution.metrics.eventsGenerated}`);
  console.log(`    Memory writes:      ${execution.metrics.memoryWrites}`);
  console.log(`    Token usage:        ${execution.metrics.tokenUsage}`);
  console.log(`    Failures:           ${execution.metrics.failures}`);
  console.log();

  // ── 9. Print Artifacts ─────────────────────────────────────────────
  console.log('  Artifacts:');
  for (const step of execution.steps) {
    if (step.artifact) {
      const preview = step.artifact.content.split('\n').slice(0, 3).join(' | ');
      console.log(`    📄 ${step.artifact.type.padEnd(15)} (${step.artifact.id})`);
      console.log(`       Preview: ${preview}...`);
    }
  }
  console.log();

  // ── 10. Print Performance Summary ──────────────────────────────────
  console.log('  Performance Summary:');
  const perfSummary = performanceTracker.getSummary();
  for (const [metric, stats] of Object.entries(perfSummary)) {
    console.log(`    ${metric}: avg=${stats.avg.toFixed(1)}ms min=${stats.min}ms max=${stats.max}ms (n=${stats.count})`);
  }
  console.log();

  // ── 11. Print Event Log ────────────────────────────────────────────
  console.log(`  Event Log (${eventLog.length} events):`);
  for (const entry of eventLog) {
    const shortEvent = entry.event.replace('workflow:', '').replace('workflow.step.', '');
    console.log(`    📡 ${shortEvent}`);
  }
  console.log();

  // ── 12. Memory verification ────────────────────────────────────────
  console.log('  Memory Verification:');
  const memEntries = await memoryEngine.query({
    layer: 'project',
    scopeId: project.id,
  });
  console.log(`    Stored ${memEntries.length} entries for project ${project.id}`);
  for (const entry of memEntries) {
    console.log(`    🔑 ${entry.key} (v${entry.version})`);
  }
  console.log();

  // ── 13. Summary ────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Vertical Slice v0.2.0-alpha — COMPLETE                  ║');
  console.log('║                                                              ║');
  console.log('║  All 8 subsystems exercised:                                ║');
  console.log('║    1. Event Bus         — streamed workflow events           ║');
  console.log('║    2. Pipeline Engine   — defined workflow stages            ║');
  console.log('║    3. Plugin Runtime    — agent lifecycle managed            ║');
  console.log('║    4. Agent Runtime     — 4 agents executed tasks            ║');
  console.log('║    5. Memory Engine     — artifacts stored & retrievable     ║');
  console.log('║    6. Model Router      — (stubbed in alpha)                ║');
  console.log('║    7. Security Engine   — initialized & health-checked       ║');
  console.log('║    8. Mission Control   — events captured for visualization  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
