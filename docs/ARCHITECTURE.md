# Architecture Overview — VOLT OS

## System Architecture

```
┌─────────────────────────────────────────┐
│            Mission Control              │
│         (Next.js Dashboard)             │
└─────────────────┬───────────────────────┘
                  │ HTTP/WebSocket
┌─────────────────┴───────────────────────┐
│            API Gateway                  │
│           (Fastify)                     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│            Event Bus                    │
│        (Redis Streams)                  │
└─────────────────┬───────────────────────┘
                  │
┌────────┬────────┼────────┬────────┐
│        │        │        │        │
Pipeline Plugin  Agent   Memory  Model
Engine   Runtime Runtime Engine  Router
│        │        │        │        │
└────────┴────────┴────────┴────────┘
                  │
┌─────────────────┴───────────────────────┐
│          Security Engine                │
│     (Auth, RBAC, Secrets)               │
└─────────────────────────────────────────┘
```

## Core Concepts

### Pipelines
DAG-based workflow orchestration. Define stages, dependencies, and agents.

### Agents
Autonomous workers implementing IAgent interface. Discover, schedule, execute.

### Plugins
Extensible modules via VoltSDK. Sandboxed execution with permission controls.

### Memory
6-layer memory system: User, Project, Agent, Knowledge Base, Vector Store, Decision History.

### Events
Schema-validated event bus with dead letter queue and replay.

## Tech Stack

- **Backend**: TypeScript, Fastify, PostgreSQL, Redis
- **Frontend**: Next.js, React, Tailwind
- **Testing**: Vitest, pytest
- **CI/CD**: GitHub Actions
