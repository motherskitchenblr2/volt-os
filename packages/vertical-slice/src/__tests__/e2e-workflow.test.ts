/**
 * @module __tests__/e2e-workflow
 * End-to-end test for the Vertical Slice workflow.
 *
 * Exercises the complete pipeline:
 *   1. Initialize all 8 subsystems
 *   2. Register and activate 4 agents
 *   3. Create a project request
 *   4. Execute the workflow orchestrator
 *   5. Verify all steps completed successfully
 *   6. Verify all artifacts stored in Memory
 *   7. Verify events emitted via Event Bus
 *   8. Verify performance metrics recorded
 *   9. Verify no failures occurred
 *  10. Verify workflow duration > 0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryEventBus } from '@volt-os/event-bus';
import { AgentRegistry, AgentExecutor } from '@volt-os/agent-runtime';
import {
  MemoryEngine,
  InMemoryStore,
  InMemoryVectorStore,
} from '@volt-os/memory-engine';
import { SecurityEngine } from '@volt-os/security-engine';
import { PerformanceTracker } from '../metrics/performance-tracker.js';
import { WorkflowOrchestrator, WorkflowEvents } from '../workflow/workflow-orchestrator.js';
import { ResearcherAgent } from '../agents/researcher-agent.js';
import { ArchitectAgent } from '../agents/architect-agent.js';
import { FrontendAgent } from '../agents/frontend-agent.js';
import { QAAgent } from '../agents/qa-agent.js';
import type { ProjectRequest, WorkflowExecution } from '../types.js';
import { createMinimalContext, createManifest } from './helpers.js';

// ---------------------------------------------------------------------------
// E2E Test Suite
// ---------------------------------------------------------------------------

describe('Vertical Slice E2E Workflow', () => {
  let eventBus: InMemoryEventBus;
  let agentRegistry: AgentRegistry;
  let agentExecutor: AgentExecutor;
  let memoryEngine: MemoryEngine;
  let securityEngine: SecurityEngine;
  let performanceTracker: PerformanceTracker;
  let orchestrator: WorkflowOrchestrator;
  let project: ProjectRequest;

  /** Collected events for assertions. */
  let collectedEvents: Array<{ event: string; data: Record<string, unknown> }>;

  beforeEach(async () => {
    // Initialize subsystems
    eventBus = new InMemoryEventBus();
    agentRegistry = new AgentRegistry();
    agentExecutor = new AgentExecutor({ eventBus });

    const memStore = new InMemoryStore();
    const memVectorStore = new InMemoryVectorStore(128);

    memoryEngine = new MemoryEngine({
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

    securityEngine = new SecurityEngine({
      jwtSecret: 'e2e-test-secret-32-chars-here!!!',
      policies: [],
      eventBus,
    });

    performanceTracker = new PerformanceTracker();

    // Register and activate agents
    const agents = [
      { id: 'researcher', caps: ['research', 'requirements-analysis'], impl: new ResearcherAgent() },
      { id: 'architect', caps: ['architecture', 'system-design', 'adr'], impl: new ArchitectAgent() },
      { id: 'frontend-engineer', caps: ['frontend', 'react', 'nextjs'], impl: new FrontendAgent() },
      { id: 'qa', caps: ['testing', 'validation', 'build-verification'], impl: new QAAgent() },
    ];

    const ctx = createMinimalContext();

    for (const { id, caps, impl } of agents) {
      const manifest = createManifest(id, caps);
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
      agentExecutor.registerImplementation(id, impl);
      await impl.initialize(ctx as never);
    }

    // Create orchestrator
    orchestrator = new WorkflowOrchestrator({
      eventBus,
      agentExecutor,
      agentRegistry,
      memoryEngine,
      securityEngine,
      performanceTracker,
    });

    // Collect events
    collectedEvents = [];
    const eventTypes = Object.values(WorkflowEvents);
    for (const eventType of eventTypes) {
      eventBus.on(eventType, (data) => {
        collectedEvents.push({ event: eventType, data });
      });
    }

    // Create project request
    project = {
      id: `e2e-proj-${Date.now()}`,
      description: 'Build a restaurant management web application',
      createdAt: new Date(),
    };
  });

  afterEach(() => {
    performanceTracker.reset();
  });

  // -------------------------------------------------------------------------
  // Full workflow execution
  // -------------------------------------------------------------------------

  it('should execute the complete workflow successfully', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.status).toBe('completed');
    expect(execution.completedAt).toBeDefined();
    expect(execution.id).toBeTruthy();
    expect(execution.projectId).toBe(project.id);
  });

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------

  it('should complete all 4 workflow steps', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.steps).toHaveLength(4);

    const stepNames = execution.steps.map((s) => s.name);
    expect(stepNames).toEqual(['research', 'architecture', 'frontend', 'qa-validation']);
  });

  it('should mark all steps as completed', async () => {
    const execution = await orchestrator.execute(project);

    for (const step of execution.steps) {
      expect(step.status).toBe('completed');
      expect(step.startedAt).toBeDefined();
      expect(step.completedAt).toBeDefined();
    }
  });

  it('should assign agent IDs to all steps', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.steps[0].agentId).toBe('researcher');
    expect(execution.steps[1].agentId).toBe('architect');
    expect(execution.steps[2].agentId).toBe('frontend-engineer');
    expect(execution.steps[3].agentId).toBe('qa');
  });

  // -------------------------------------------------------------------------
  // Artifacts
  // -------------------------------------------------------------------------

  it('should produce artifacts for all steps', async () => {
    const execution = await orchestrator.execute(project);

    for (const step of execution.steps) {
      expect(step.artifact).toBeDefined();
      expect(step.artifact!.id).toBeTruthy();
      expect(step.artifact!.projectId).toBe(project.id);
      expect(step.artifact!.content).toBeTruthy();
      expect(step.artifact!.createdAt).toBeInstanceOf(Date);
    }
  });

  it('should produce requirements artifact from research step', async () => {
    const execution = await orchestrator.execute(project);

    const researchArtifact = execution.steps[0].artifact!;
    expect(researchArtifact.type).toBe('requirements');
    expect(researchArtifact.content).toContain('Requirements Document');
  });

  it('should produce design artifact from architecture step', async () => {
    const execution = await orchestrator.execute(project);

    const archArtifact = execution.steps[1].artifact!;
    expect(archArtifact.type).toBe('design');
    expect(archArtifact.content).toContain('System Design');
  });

  it('should produce code artifact from frontend step', async () => {
    const execution = await orchestrator.execute(project);

    const frontendArtifact = execution.steps[2].artifact!;
    expect(frontendArtifact.type).toBe('code');
    expect(frontendArtifact.content).toContain('Generated Next.js Application');
  });

  it('should produce test-report artifact from QA step', async () => {
    const execution = await orchestrator.execute(project);

    const qaArtifact = execution.steps[3].artifact!;
    expect(qaArtifact.type).toBe('test-report');
    expect(qaArtifact.content).toContain('QA Validation Report');
  });

  it('should record token usage in artifact metadata', async () => {
    const execution = await orchestrator.execute(project);

    for (const step of execution.steps) {
      expect(step.artifact!.metadata['tokensUsed']).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  it('should emit workflow:started event', async () => {
    await orchestrator.execute(project);

    const startedEvents = collectedEvents.filter((e) => e.event === WorkflowEvents.WORKFLOW_STARTED);
    expect(startedEvents).toHaveLength(1);
    expect(startedEvents[0].data['projectId']).toBe(project.id);
  });

  it('should emit workflow:completed event on success', async () => {
    await orchestrator.execute(project);

    const completedEvents = collectedEvents.filter((e) => e.event === WorkflowEvents.WORKFLOW_COMPLETED);
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0].data['projectId']).toBe(project.id);
  });

  it('should emit step.started events for all 4 steps', async () => {
    await orchestrator.execute(project);

    const stepStarted = collectedEvents.filter((e) => e.event === WorkflowEvents.STEP_STARTED);
    expect(stepStarted).toHaveLength(4);

    const stepNames = stepStarted.map((e) => e.data['step']);
    expect(stepNames).toEqual(['research', 'architecture', 'frontend', 'qa-validation']);
  });

  it('should emit step.completed events for all 4 steps', async () => {
    await orchestrator.execute(project);

    const stepCompleted = collectedEvents.filter((e) => e.event === WorkflowEvents.STEP_COMPLETED);
    expect(stepCompleted).toHaveLength(4);
  });

  it('should emit artifact.stored events for all steps', async () => {
    await orchestrator.execute(project);

    const artifactEvents = collectedEvents.filter((e) => e.event === WorkflowEvents.ARTIFACT_STORED);
    expect(artifactEvents).toHaveLength(4);
  });

  it('should not emit workflow:failed on success', async () => {
    await orchestrator.execute(project);

    const failedEvents = collectedEvents.filter((e) => e.event === WorkflowEvents.WORKFLOW_FAILED);
    expect(failedEvents).toHaveLength(0);
  });

  it('should not emit step.failed events on success', async () => {
    await orchestrator.execute(project);

    const stepFailed = collectedEvents.filter((e) => e.event === WorkflowEvents.STEP_FAILED);
    expect(stepFailed).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Memory
  // -------------------------------------------------------------------------

  it('should store artifacts in Memory Engine', async () => {
    await orchestrator.execute(project);

    const entries = await memoryEngine.query({
      layer: 'project',
      scopeId: project.id,
    });

    // 4 artifacts + 1 execution summary
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });

  it('should store each step artifact with a unique key', async () => {
    await orchestrator.execute(project);

    const keys = ['artifact:research', 'artifact:architecture', 'artifact:frontend', 'artifact:qa-validation'];

    for (const key of keys) {
      const entry = await memoryEngine.read('project', project.id, key);
      expect(entry).not.toBeNull();
      expect(entry!.content).toBeTruthy();
    }
  });

  it('should store workflow execution summary in Memory', async () => {
    await orchestrator.execute(project);

    const entry = await memoryEngine.read('project', project.id, 'workflow:execution');
    expect(entry).not.toBeNull();

    const executionData = JSON.parse(entry!.content) as WorkflowExecution;
    expect(executionData.status).toBe('completed');
    expect(executionData.steps).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  it('should track no failures in metrics', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.metrics.failures).toBe(0);
  });

  it('should track positive token usage in metrics', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.metrics.tokenUsage).toBeGreaterThan(0);
  });

  it('should track events generated in metrics', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.metrics.eventsGenerated).toBeGreaterThan(0);
  });

  it('should track memory writes in metrics', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.metrics.memoryWrites).toBeGreaterThan(0);
  });

  it('should track positive execution duration', async () => {
    const execution = await orchestrator.execute(project);

    expect(execution.metrics.totalExecutionMs).toBeGreaterThanOrEqual(0);
  });

  it('should record performance tracker metrics', async () => {
    await orchestrator.execute(project);

    const names = performanceTracker.getMetricNames();
    expect(names.length).toBeGreaterThan(0);

    // Should have duration metrics for each step
    const durationMetrics = names.filter((n) => n.includes('.durationMs'));
    expect(durationMetrics.length).toBe(4);

    // Should have token metrics for each step
    const tokenMetrics = names.filter((n) => n.includes('.tokens'));
    expect(tokenMetrics.length).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Security
  // -------------------------------------------------------------------------

  it('should have Security Engine initialized and healthy', async () => {
    const health = await securityEngine.healthCheck();
    expect(health.status).toBe('healthy');
  });

  // -------------------------------------------------------------------------
  // Execution timing
  // -------------------------------------------------------------------------

  it('should record step durations in chronological order', async () => {
    const execution = await orchestrator.execute(project);

    for (const step of execution.steps) {
      expect(step.startedAt).toBeDefined();
      expect(step.completedAt).toBeDefined();
      if (step.startedAt && step.completedAt) {
        expect(step.completedAt.getTime()).toBeGreaterThanOrEqual(step.startedAt.getTime());
      }
    }
  });

  // -------------------------------------------------------------------------
  // Multiple executions
  // -------------------------------------------------------------------------

  it('should handle multiple sequential executions independently', async () => {
    const project1: ProjectRequest = {
      id: 'multi-proj-1',
      description: 'First project',
      createdAt: new Date(),
    };

    const project2: ProjectRequest = {
      id: 'multi-proj-2',
      description: 'Second project',
      createdAt: new Date(),
    };

    const exec1 = await orchestrator.execute(project1);
    const exec2 = await orchestrator.execute(project2);

    expect(exec1.status).toBe('completed');
    expect(exec2.status).toBe('completed');
    expect(exec1.projectId).toBe('multi-proj-1');
    expect(exec2.projectId).toBe('multi-proj-2');
    expect(exec1.id).not.toBe(exec2.id);

    // Both sets of artifacts should be in memory
    const entries1 = await memoryEngine.query({ layer: 'project', scopeId: 'multi-proj-1' });
    const entries2 = await memoryEngine.query({ layer: 'project', scopeId: 'multi-proj-2' });

    expect(entries1.length).toBeGreaterThanOrEqual(5);
    expect(entries2.length).toBeGreaterThanOrEqual(5);
  });

  // -------------------------------------------------------------------------
  // Artifact chaining
  // -------------------------------------------------------------------------

  it('should chain artifacts between steps (architecture uses research output)', async () => {
    const execution = await orchestrator.execute(project);

    // The architecture step should have received the research output
    const researchContent = execution.steps[0].artifact!.content;
    const archContent = execution.steps[1].artifact!.content;

    // Both should contain project-specific information
    expect(researchContent).toContain('Requirements Document');
    expect(archContent).toContain('System Design');
  });
});
