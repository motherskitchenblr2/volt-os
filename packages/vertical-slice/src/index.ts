/**
 * @module index
 * Public API for the VOLT OS Vertical Slice v0.2.0-alpha.
 *
 * Re-exports all types, the orchestrator, agents, pipeline definition,
 * and performance tracker for consumption by tests, demos, and
 * Mission Control.
 */

// ── Types ─────────────────────────────────────────────────────────────
export type {
  ProjectRequest,
  ProjectArtifact,
  ArtifactType,
  WorkflowExecution,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowStatus,
  WorkflowMetrics,
  AgentExecutionInput,
  AgentExecutionResult,
  PipelineStageDefinition,
} from './types.js';

// ── Orchestrator ──────────────────────────────────────────────────────
export {
  WorkflowOrchestrator,
  WorkflowEvents,
} from './workflow/workflow-orchestrator.js';
export type { WorkflowOrchestratorOptions } from './workflow/workflow-orchestrator.js';

// ── Pipeline Definition ───────────────────────────────────────────────
export {
  VERTICAL_SLICE_STAGES,
  buildPipelineDefinition,
  getWorkflowDescription,
} from './workflow/pipeline-definition.js';

// ── Agents ────────────────────────────────────────────────────────────
export { ResearcherAgent } from './agents/researcher-agent.js';
export { ArchitectAgent } from './agents/architect-agent.js';
export { FrontendAgent } from './agents/frontend-agent.js';
export { QAAgent } from './agents/qa-agent.js';

// ── Metrics ───────────────────────────────────────────────────────────
export { PerformanceTracker } from './metrics/performance-tracker.js';
export type { MetricSummary } from './metrics/performance-tracker.js';
