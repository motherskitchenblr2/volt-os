/**
 * @module workflow/pipeline-definition
 * Pipeline definition for the vertical-slice workflow.
 *
 * Defines the four sequential stages (research → architecture → frontend → QA)
 * with their inputs, outputs, and dependency relationships. This definition
 * is consumed by both the Pipeline Engine (for actual orchestration) and the
 * WorkflowOrchestrator (for simplified execution).
 */

import type {
  PipelineStageDefinition,
} from '../types.js';
import type {
  PipelineDefinition,
  TaskDefinition,
} from '@volt-os/pipeline-engine';

// ---------------------------------------------------------------------------
// Vertical-Slice Stage Definitions (high-level)
// ---------------------------------------------------------------------------

/**
 * Ordered stage definitions for the vertical-slice workflow.
 * Each stage maps 1:1 to an agent and declares its I/O contract.
 */
export const VERTICAL_SLICE_STAGES: readonly PipelineStageDefinition[] = [
  {
    name: 'research',
    agentId: 'researcher',
    inputs: ['projectDescription'],
    outputs: ['requirements'],
  },
  {
    name: 'architecture',
    agentId: 'architect',
    inputs: ['requirements'],
    outputs: ['design', 'adr'],
    dependsOn: ['research'],
  },
  {
    name: 'frontend',
    agentId: 'frontend-engineer',
    inputs: ['design'],
    outputs: ['code'],
    dependsOn: ['architecture'],
  },
  {
    name: 'qa-validation',
    agentId: 'qa',
    inputs: ['code'],
    outputs: ['test-report'],
    dependsOn: ['frontend'],
  },
] as const;

// ---------------------------------------------------------------------------
// Pipeline Engine Definition
// ---------------------------------------------------------------------------

/**
 * Converts the high-level stage definitions into a PipelineEngine-compatible
 * PipelineDefinition with TaskDefinitions and dependency edges.
 */
export function buildPipelineDefinition(): PipelineDefinition {
  const tasks: TaskDefinition[] = VERTICAL_SLICE_STAGES.map((stage) => ({
    id: stage.name,
    name: stage.name,
    type: stage.agentId,
    dependencies: stage.dependsOn ?? [],
    config: {
      agentId: stage.agentId,
      inputs: stage.inputs,
      outputs: stage.outputs,
    },
    timeoutMs: 120_000,
    retryPolicy: {
      maxRetries: 2,
      delayMs: 1_000,
      backoffMultiplier: 2,
      maxDelayMs: 10_000,
    },
  }));

  return {
    id: 'vertical-slice-v0.2.0',
    name: 'vertical-slice-workflow',
    tasks,
    config: {
      retryPolicy: {
        maxRetries: 2,
        delayMs: 1_000,
        backoffMultiplier: 2,
        maxDelayMs: 10_000,
      },
      timeoutMs: 300_000,
    },
  };
}

/**
 * Returns the human-readable workflow description for display purposes.
 */
export function getWorkflowDescription(): string {
  return [
    'Vertical Slice v0.2.0-alpha — End-to-end project generation workflow',
    '',
    'Stages:',
    ...VERTICAL_SLICE_STAGES.map(
      (s) => `  ${s.name} (${s.agentId}): [${s.inputs.join(', ')}] → [${s.outputs.join(', ')}]`,
    ),
    '',
    'Exercises: Event Bus, Pipeline Engine, Plugin Runtime, Agent Runtime,',
    '           Memory Engine, Model Router, Security Engine, Mission Control',
  ].join('\n');
}
