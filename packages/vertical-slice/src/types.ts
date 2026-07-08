/**
 * @module types
 * Core type definitions for the VOLT OS Vertical Slice.
 *
 * Defines the data structures shared across the end-to-end workflow:
 * project requests, artifacts, workflow execution state, and metrics.
 */

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/** A user-initiated project creation request. */
export interface ProjectRequest {
  /** Unique project identifier. */
  id: string;
  /** Natural-language description of the project. */
  description: string;
  /** Timestamp when the project was created. */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/** Discriminated union of artifact types produced by the workflow. */
export type ArtifactType = 'requirements' | 'design' | 'adr' | 'code' | 'test-report';

/** A single artifact produced by an agent during the workflow. */
export interface ProjectArtifact {
  /** Unique artifact identifier. */
  id: string;
  /** The project this artifact belongs to. */
  projectId: string;
  /** The kind of artifact (requirements, design, code, etc.). */
  type: ArtifactType;
  /** The artifact content (markdown, JSON, source code, etc.). */
  content: string;
  /** Arbitrary metadata (agent IDs, token counts, durations, etc.). */
  metadata: Record<string, unknown>;
  /** Timestamp when the artifact was created. */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Workflow Execution
// ---------------------------------------------------------------------------

/** Overall status of a workflow execution. */
export type WorkflowStatus = 'running' | 'completed' | 'failed';

/** Status of an individual workflow step. */
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Represents a single step in the workflow execution. */
export interface WorkflowStep {
  /** Human-readable name of the step (e.g. "research", "architecture"). */
  name: string;
  /** ID of the agent that executed (or will execute) this step. */
  agentId?: string;
  /** Current status of the step. */
  status: WorkflowStepStatus;
  /** When the step started executing. */
  startedAt?: Date;
  /** When the step finished (successfully or not). */
  completedAt?: Date;
  /** Artifact produced by this step, if any. */
  artifact?: ProjectArtifact;
}

/** Aggregate metrics for the entire workflow execution. */
export interface WorkflowMetrics {
  /** Wall-clock duration in milliseconds. */
  totalExecutionMs: number;
  /** Number of events emitted during execution. */
  eventsGenerated: number;
  /** Number of memory writes performed. */
  memoryWrites: number;
  /** Total tokens consumed across all agents. */
  tokenUsage: number;
  /** Number of step failures encountered. */
  failures: number;
  /** Time spent in recovery logic in milliseconds. */
  recoveryTimeMs: number;
}

/** Complete record of a workflow execution. */
export interface WorkflowExecution {
  /** Unique execution identifier. */
  id: string;
  /** The project this execution is for. */
  projectId: string;
  /** Overall workflow status. */
  status: WorkflowStatus;
  /** When execution started. */
  startedAt: Date;
  /** When execution finished (set on completion or failure). */
  completedAt?: Date;
  /** Ordered list of workflow steps. */
  steps: WorkflowStep[];
  /** Aggregate execution metrics. */
  metrics: WorkflowMetrics;
}

// ---------------------------------------------------------------------------
// Agent Task / Result (thin wrappers for the vertical slice)
// ---------------------------------------------------------------------------

/** Input passed to a vertical-slice agent for execution. */
export interface AgentExecutionInput {
  /** The task type identifier (e.g. "research", "architecture"). */
  taskType: string;
  /** Arbitrary input payload. */
  input: Record<string, unknown>;
}

/** Output returned by a vertical-slice agent after execution. */
export interface AgentExecutionResult {
  /** Whether the agent completed successfully. */
  success: boolean;
  /** The text output (markdown, source, etc.). */
  output: string;
  /** Number of tokens consumed. */
  tokensUsed: number;
  /** Any additional metadata. */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pipeline Stage Definition (for the vertical slice)
// ---------------------------------------------------------------------------

/** Definition of a single stage in the vertical-slice pipeline. */
export interface PipelineStageDefinition {
  /** Unique stage identifier. */
  name: string;
  /** The agent responsible for this stage. */
  agentId: string;
  /** Input variable names expected by the stage. */
  inputs: string[];
  /** Output variable names produced by the stage. */
  outputs: string[];
  /** IDs of stages that must complete before this one. */
  dependsOn?: string[];
}
