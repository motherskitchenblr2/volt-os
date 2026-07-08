# RUNTIME BOUNDARY — VOLT OS

Version: 1.0
Status: LOCKED

---

## Overview

VOLT OS operates with two runtimes:

1. **TypeScript Runtime** — Orchestration, pipelines, plugins, dashboard, events
2. **Python Runtime** — AI workers, model execution, embeddings, heavy AI processing

This document defines the boundary, contracts, and communication protocols.

---

## TypeScript Runtime

### Responsibilities
- API Gateway (Fastify)
- Pipeline Engine (DAG orchestration)
- Plugin Runtime (VoltSDK)
- Agent Runtime (scheduling, health)
- Event Bus (schema registry, DLQ)
- Mission Control (dashboard)
- Memory Engine (metadata, vectors via pgvector)
- Security Engine (auth, RBAC, secrets)

### Ownership
- All user-facing HTTP/WebSocket endpoints
- All pipeline orchestration
- All plugin lifecycle management
- All event publishing/subscribing
- All security enforcement

### Constraints
- No direct model inference
- No heavy AI processing
- No embedding generation
- No Python code execution

---

## Python Runtime

### Responsibilities
- AI model execution (OpenAI, Anthropic, local)
- Embedding generation (pgvector, Qdrant)
- Text processing (chunking, summarization)
- Code generation (frontend, backend)
- Research synthesis
- Document analysis

### Ownership
- All AI model API calls
- All embedding operations
- All text/code generation
- All heavy computation

### Constraints
- No API endpoint exposure
- No database writes (except embeddings)
- No event publishing (via TypeScript)
- No security enforcement

---

## Communication Protocol

### TypeScript → Python

| Method | Use Case | Protocol |
|--------|----------|----------|
| Event Bus | Trigger AI tasks | Redis Streams |
| gRPC | Low-latency calls | Protocol Buffers |
| REST | Simple requests | HTTP/JSON |
| Queue | Async tasks | BullMQ (Redis) |

### Python → TypeScript

| Method | Use Case | Protocol |
|--------|----------|----------|
| Event Bus | Report results | Redis Streams |
| gRPC | Status updates | Protocol Buffers |
| Callback | Task completion | HTTP POST |

---

## Ownership Matrix

| Component | TypeScript | Python |
|-----------|-----------|--------|
| API Gateway | ✅ Owner | ❌ |
| Pipeline Engine | ✅ Owner | ❌ |
| Plugin Runtime | ✅ Owner | ❌ |
| Agent Runtime | ✅ Owner | ❌ |
| Event Bus | ✅ Owner | ❌ |
| Memory Engine | ✅ Metadata | ✅ Embeddings |
| Model Router | ✅ Routing | ✅ Execution |
| Security Engine | ✅ Owner | ❌ |
| Mission Control | ✅ Owner | ❌ |

---

## Contract Definitions

### Task Request (TypeScript → Python)

```typescript
interface AITaskRequest {
  taskId: string;
  type: 'generate' | 'embed' | 'analyze' | 'summarize';
  input: Record<string, unknown>;
  config: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  timeout: number;
}
```

### Task Response (Python → TypeScript)

```typescript
interface AITaskResponse {
  taskId: string;
  status: 'success' | 'error';
  output: Record<string, unknown>;
  metrics: {
    tokens: number;
    latencyMs: number;
    costUsd: number;
  };
  error?: string;
}
```

---

## Failure Handling

### TypeScript Failures
- API errors → return HTTP error
- Pipeline failures → retry, then DLQ
- Event failures → dead letter queue
- Security violations → deny + audit log

### Python Failures
- Model API errors → retry with backoff
- Timeout → kill process, notify TypeScript
- OOM → restart worker, report failure
- Crash → restart, retry task

### Recovery
- TypeScript: automatic restart via PM2/Docker
- Python: worker pool with auto-restart
- State: persisted in PostgreSQL (survives restarts)

---

## Deployment

### TypeScript
- Single process (Node.js)
- PM2 or Docker
- Port 3000 (HTTP), 3001 (WebSocket)

### Python
- Worker pool (multiple processes)
- Docker container
- No exposed ports (internal only)

### Communication
- Docker network (internal)
- Redis (Event Bus, Queue)
- PostgreSQL (shared database)

---

## Testing Boundary

### TypeScript Tests
- Unit tests (vitest)
- Integration tests
- E2E tests (Playwright)

### Python Tests
- Unit tests (pytest)
- Integration tests
- AI model mocking

### Cross-Boundary Tests
- Event flow tests
- Task completion tests
- Failure recovery tests
