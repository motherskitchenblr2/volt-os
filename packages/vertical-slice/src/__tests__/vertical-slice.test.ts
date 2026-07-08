/**
 * @module __tests__/vertical-slice
 * Unit tests for the Vertical Slice components.
 *
 * Tests:
 * - PerformanceTracker metrics recording and summaries
 * - Pipeline definition generation
 * - Agent validation and heartbeat (IAgent interface)
 * - Artifact types and workflow step types
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceTracker } from '../metrics/performance-tracker.js';
import {
  VERTICAL_SLICE_STAGES,
  buildPipelineDefinition,
  getWorkflowDescription,
} from '../workflow/pipeline-definition.js';
import { ResearcherAgent } from '../agents/researcher-agent.js';
import { ArchitectAgent } from '../agents/architect-agent.js';
import { FrontendAgent } from '../agents/frontend-agent.js';
import { QAAgent } from '../agents/qa-agent.js';

// ---------------------------------------------------------------------------
// PerformanceTracker
// ---------------------------------------------------------------------------

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker();
  });

  it('should record and retrieve metric samples', () => {
    tracker.record('test.metric', 100);
    tracker.record('test.metric', 200);
    tracker.record('test.metric', 300);

    const samples = tracker.getSamples('test.metric');
    expect(samples).toEqual([100, 200, 300]);
  });

  it('should compute correct summary statistics', () => {
    tracker.record('latency', 50);
    tracker.record('latency', 100);
    tracker.record('latency', 150);

    const summary = tracker.getMetricSummary('latency');
    expect(summary).not.toBeNull();
    expect(summary!.avg).toBe(100);
    expect(summary!.min).toBe(50);
    expect(summary!.max).toBe(150);
    expect(summary!.count).toBe(3);
    expect(summary!.total).toBe(300);
  });

  it('should return null for unknown metrics', () => {
    expect(tracker.getMetricSummary('nonexistent')).toBeNull();
  });

  it('should return empty array for unknown metric samples', () => {
    expect(tracker.getSamples('nonexistent')).toEqual([]);
  });

  it('should handle single sample', () => {
    tracker.record('single', 42);

    const summary = tracker.getMetricSummary('single');
    expect(summary).not.toBeNull();
    expect(summary!.avg).toBe(42);
    expect(summary!.min).toBe(42);
    expect(summary!.max).toBe(42);
    expect(summary!.count).toBe(1);
  });

  it('should track multiple metrics independently', () => {
    tracker.record('metric.a', 10);
    tracker.record('metric.b', 20);
    tracker.record('metric.a', 15);

    const all = tracker.getSummary();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all['metric.a'].avg).toBe(12.5);
    expect(all['metric.b'].avg).toBe(20);
  });

  it('should return metric names', () => {
    tracker.record('alpha', 1);
    tracker.record('beta', 2);
    tracker.record('gamma', 3);

    const names = tracker.getMetricNames();
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
    expect(names).toHaveLength(3);
  });

  it('should return total count across all metrics', () => {
    tracker.record('a', 1);
    tracker.record('a', 2);
    tracker.record('b', 3);

    expect(tracker.totalCount()).toBe(3);
  });

  it('should reset all metrics', () => {
    tracker.record('a', 1);
    tracker.record('b', 2);

    tracker.reset();

    expect(tracker.totalCount()).toBe(0);
    expect(tracker.getMetricNames()).toEqual([]);
  });

  it('should handle negative values', () => {
    tracker.record('temp', -10);
    tracker.record('temp', 5);
    tracker.record('temp', -5);

    const summary = tracker.getMetricSummary('temp');
    expect(summary!.min).toBe(-10);
    expect(summary!.max).toBe(5);
    expect(summary!.avg).toBe(-10 / 3);
  });

  it('should handle floating-point values', () => {
    tracker.record('precise', 1.5);
    tracker.record('precise', 2.5);
    tracker.record('precise', 3.0);

    const summary = tracker.getMetricSummary('precise');
    expect(summary!.avg).toBeCloseTo(2.333, 2);
  });
});

// ---------------------------------------------------------------------------
// Pipeline Definition
// ---------------------------------------------------------------------------

describe('Pipeline Definition', () => {
  it('should define exactly 4 stages', () => {
    expect(VERTICAL_SLICE_STAGES).toHaveLength(4);
  });

  it('should have research as the first stage', () => {
    expect(VERTICAL_SLICE_STAGES[0].name).toBe('research');
    expect(VERTICAL_SLICE_STAGES[0].agentId).toBe('researcher');
    expect(VERTICAL_SLICE_STAGES[0].dependsOn).toBeUndefined();
  });

  it('should have architecture depend on research', () => {
    const arch = VERTICAL_SLICE_STAGES[1];
    expect(arch.name).toBe('architecture');
    expect(arch.dependsOn).toEqual(['research']);
  });

  it('should have frontend depend on architecture', () => {
    const frontend = VERTICAL_SLICE_STAGES[2];
    expect(frontend.name).toBe('frontend');
    expect(frontend.dependsOn).toEqual(['architecture']);
  });

  it('should have qa-validation depend on frontend', () => {
    const qa = VERTICAL_SLICE_STAGES[3];
    expect(qa.name).toBe('qa-validation');
    expect(qa.dependsOn).toEqual(['frontend']);
  });

  it('should build a PipelineEngine-compatible definition', () => {
    const def = buildPipelineDefinition();

    expect(def.id).toBe('vertical-slice-v0.2.0');
    expect(def.name).toBe('vertical-slice-workflow');
    expect(def.tasks).toHaveLength(4);
    expect(def.config.timeoutMs).toBe(300_000);
  });

  it('should produce correct task dependencies in pipeline definition', () => {
    const def = buildPipelineDefinition();

    const researchTask = def.tasks.find((t) => t.id === 'research');
    expect(researchTask!.dependencies).toEqual([]);

    const archTask = def.tasks.find((t) => t.id === 'architecture');
    expect(archTask!.dependencies).toEqual(['research']);

    const frontendTask = def.tasks.find((t) => t.id === 'frontend');
    expect(frontendTask!.dependencies).toEqual(['architecture']);

    const qaTask = def.tasks.find((t) => t.id === 'qa-validation');
    expect(qaTask!.dependencies).toEqual(['frontend']);
  });

  it('should include retry policies in pipeline definition', () => {
    const def = buildPipelineDefinition();
    for (const task of def.tasks) {
      expect(task.retryPolicy).toBeDefined();
      expect(task.retryPolicy!.maxRetries).toBe(2);
    }
  });

  it('should produce a non-empty workflow description', () => {
    const desc = getWorkflowDescription();
    expect(desc).toContain('Vertical Slice');
    expect(desc).toContain('research');
    expect(desc).toContain('architecture');
    expect(desc).toContain('frontend');
    expect(desc).toContain('qa-validation');
  });
});

// ---------------------------------------------------------------------------
// Agent Validation & Heartbeat
// ---------------------------------------------------------------------------

describe('ResearcherAgent', () => {
  let agent: ResearcherAgent;

  beforeEach(() => {
    agent = new ResearcherAgent();
  });

  it('should have correct id and capabilities', () => {
    expect(agent.id).toBe('researcher');
    expect(agent.capabilities).toContain('research');
    expect(agent.capabilities).toContain('requirements-analysis');
  });

  it('should reject execution before initialization', async () => {
    const task = {
      id: 'task-1',
      type: 'research',
      input: { projectDescription: 'test' },
      requiredCapabilities: ['research'],
      context: {},
    };

    await expect(agent.execute(task)).rejects.toThrow('must be initialized');
  });

  it('should validate tasks correctly', async () => {
    const validTask = {
      id: 'task-1',
      type: 'research',
      input: { projectDescription: 'Build an app' },
      requiredCapabilities: ['research'],
      context: {},
    };

    const result = await agent.validate(validTask);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject tasks missing projectDescription', async () => {
    const invalidTask = {
      id: 'task-1',
      type: 'research',
      input: {},
      requiredCapabilities: ['research'],
      context: {},
    };

    const result = await agent.validate(invalidTask);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should report unhealthy before initialization', async () => {
    const health = await agent.heartbeat();
    expect(health.status).toBe('unhealthy');
  });
});

describe('ArchitectAgent', () => {
  let agent: ArchitectAgent;

  beforeEach(() => {
    agent = new ArchitectAgent();
  });

  it('should have correct id and capabilities', () => {
    expect(agent.id).toBe('architect');
    expect(agent.capabilities).toContain('architecture');
    expect(agent.capabilities).toContain('system-design');
    expect(agent.capabilities).toContain('adr');
  });

  it('should reject execution before initialization', async () => {
    const task = {
      id: 'task-1',
      type: 'architecture',
      input: { requirements: 'some reqs' },
      requiredCapabilities: ['architecture'],
      context: {},
    };

    await expect(agent.execute(task)).rejects.toThrow('must be initialized');
  });

  it('should validate tasks correctly', async () => {
    const validTask = {
      id: 'task-1',
      type: 'architecture',
      input: { requirements: 'Build an app' },
      requiredCapabilities: ['architecture'],
      context: {},
    };

    const result = await agent.validate(validTask);
    expect(result.valid).toBe(true);
  });

  it('should reject tasks missing requirements', async () => {
    const invalidTask = {
      id: 'task-1',
      type: 'architecture',
      input: {},
      requiredCapabilities: ['architecture'],
      context: {},
    };

    const result = await agent.validate(invalidTask);
    expect(result.valid).toBe(false);
  });
});

describe('FrontendAgent', () => {
  let agent: FrontendAgent;

  beforeEach(() => {
    agent = new FrontendAgent();
  });

  it('should have correct id and capabilities', () => {
    expect(agent.id).toBe('frontend-engineer');
    expect(agent.capabilities).toContain('frontend');
    expect(agent.capabilities).toContain('react');
    expect(agent.capabilities).toContain('nextjs');
  });

  it('should validate tasks correctly', async () => {
    const validTask = {
      id: 'task-1',
      type: 'code-generation',
      input: { design: 'system design' },
      requiredCapabilities: ['frontend'],
      context: {},
    };

    const result = await agent.validate(validTask);
    expect(result.valid).toBe(true);
  });

  it('should reject tasks missing design', async () => {
    const invalidTask = {
      id: 'task-1',
      type: 'code-generation',
      input: {},
      requiredCapabilities: ['frontend'],
      context: {},
    };

    const result = await agent.validate(invalidTask);
    expect(result.valid).toBe(false);
  });
});

describe('QAAgent', () => {
  let agent: QAAgent;

  beforeEach(() => {
    agent = new QAAgent();
  });

  it('should have correct id and capabilities', () => {
    expect(agent.id).toBe('qa');
    expect(agent.capabilities).toContain('testing');
    expect(agent.capabilities).toContain('validation');
    expect(agent.capabilities).toContain('build-verification');
  });

  it('should validate tasks correctly', async () => {
    const validTask = {
      id: 'task-1',
      type: 'validation',
      input: { code: 'const x = 1;' },
      requiredCapabilities: ['testing'],
      context: {},
    };

    const result = await agent.validate(validTask);
    expect(result.valid).toBe(true);
  });

  it('should reject tasks missing code', async () => {
    const invalidTask = {
      id: 'task-1',
      type: 'validation',
      input: {},
      requiredCapabilities: ['testing'],
      context: {},
    };

    const result = await agent.validate(invalidTask);
    expect(result.valid).toBe(false);
  });
});
