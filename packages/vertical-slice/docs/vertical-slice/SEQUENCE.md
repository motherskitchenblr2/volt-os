# Vertical Slice — Sequence Diagram

## Workflow Execution

```
┌─────────┐   ┌──────────────┐   ┌─────────────────────┐
│   User   │──▶│ API Gateway  │──▶│ WorkflowOrchestrator │
└─────────┘   └──────────────┘   └──────────┬──────────┘
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │ Pipeline Engine │
                                   │  (stages DAG)  │
                                   └────────┬───────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
           ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
           │ Research     │      │ Architect    │      │ Frontend     │
           │ Agent        │─────▶│ Agent        │─────▶│ Agent        │
           └──────┬───────┘      └──────┬───────┘      └──────┬───────┘
                  │ (Requirements)       │ (Design)            │ (Code)
                  ▼                      ▼                     ▼
           ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
           │ Memory Engine│◀─────│ QA Agent     │◀─────│ Memory       │
           │ (store)      │      │ (validate)   │      │ Engine       │
           └──────┬───────┘      └──────────────┘      └──────────────┘
                  │
                  ▼
           ┌──────────────┐      ┌──────────────┐
           │ Event Bus    │─────▶│ Mission      │
           │ (stream)     │      │ Control      │
           └──────────────┘      └──────┬───────┘
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │ User         │
                                 │ (download)   │
                                 └──────────────┘
```

## Detailed Step Sequence

```
User                    Orchestrator              Agent Runtime         Memory Engine        Event Bus
 │                          │                          │                    │                  │
 │  createProject(desc)     │                          │                    │                  │
 │─────────────────────────▶│                          │                    │                  │
 │                          │  emit(workflow:started)   │                    │                  │
 │                          │─────────────────────────────────────────────────────────────────▶│
 │                          │                          │                    │                  │
 │                          │  ┌─ Step 1: Research ─┐  │                    │                  │
 │                          │  │                    │  │                    │                  │
 │                          │  │ emit(step.started) │  │                    │                  │
 │                          │  │─────────────────────────────────────────────────────────────▶│
 │                          │  │                    │  │                    │                  │
 │                          │  │ execute(researcher)│  │                    │                  │
 │                          │  │───────────────────▶│  │                    │                  │
 │                          │  │                    │  │                    │                  │
 │                          │  │    result(output)  │  │                    │                  │
 │                          │  │◀───────────────────│  │                    │                  │
 │                          │  │                    │  │                    │                  │
 │                          │  │ emit(step.completed)│ │                    │                  │
 │                          │  │─────────────────────────────────────────────────────────────▶│
 │                          │  └────────────────────┘  │                    │                  │
 │                          │                          │                    │                  │
 │                          │  ┌─ Step 2: Architecture┐│                    │                  │
 │                          │  │ (uses research output)│ │                   │                  │
 │                          │  └────────────────────┘  │                    │                  │
 │                          │                          │                    │                  │
 │                          │  ┌─ Step 3: Frontend ──┐ │                    │                  │
 │                          │  │ (uses design output) │ │                   │                  │
 │                          │  └─────────────────────┘ │                    │                  │
 │                          │                          │                    │                  │
 │                          │  ┌─ Step 4: QA ────────┐ │                    │                  │
 │                          │  │ (uses code output)   │ │                   │                  │
 │                          │  └─────────────────────┘ │                    │                  │
 │                          │                          │                    │                  │
 │                          │  storeArtifacts()        │                    │                  │
 │                          │──────────────────────────────────────────────▶│                  │
 │                          │                          │                    │                  │
 │                          │  emit(workflow:completed) │                    │                  │
 │                          │─────────────────────────────────────────────────────────────────▶│
 │                          │                          │                    │                  │
 │  return(execution)       │                          │                    │                  │
 │◀─────────────────────────│                          │                    │                  │
```

## Event Flow

```
Event                                    Source            Payload
─────────────────────────────────────────────────────────────────────
workflow:started                        Orchestrator     { executionId, projectId }
workflow:step.started                   Orchestrator     { step, agentId }
workflow:step.completed                 Orchestrator     { step, agentId, durationMs, artifactId }
workflow:artifact.stored                Orchestrator     { step, artifactId, artifactType }
workflow:completed                      Orchestrator     { executionId, totalMs, stepsCompleted }

Memory Engine (per write):
memory:written                          MemoryEngine     { layer, scopeId, key, id, version }

Agent Runtime (per agent execution):
agent:running                           AgentExecutor    { agentId, taskId }
agent:completed                         AgentExecutor    { agentId, taskId, status, elapsedMs }
```

## Artifact Chain

```
Project Description
        │
        ▼
┌───────────────┐
│ Research Agent │ ──▶ Requirements Document (markdown)
└───────────────┘
        │
        ▼
┌────────────────┐
│ Architect Agent │ ──▶ System Design + ADR (markdown)
└────────────────┘
        │
        ▼
┌────────────────┐
│ Frontend Agent  │ ──▶ Next.js Source Code (ts/tsx)
└────────────────┘
        │
        ▼
┌────────────┐
│ QA Agent    │ ──▶ Validation Report (markdown)
└────────────┘
        │
        ▼
┌───────────────┐
│ Memory Engine │ ──▶ All artifacts persisted (project layer)
└───────────────┘
```
