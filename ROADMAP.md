# VOLT OS — Roadmap

## Phase 0: Foundation ✅

- Architecture documents (PRD, System Architecture, Agent Spec, Roadmap)
- Engineering bootstrap (monorepo, Docker, CI/CD, fitness tests)

## Phase 1: Platform Core 🚧

- [x] Event Bus (in-process, Redis, outbox, schema registry, DLQ)
- [x] API Gateway (Fastify, REST, WebSocket, auth, rate limiting)
- [ ] Pipeline Engine (11-stage state machine, task queue, rollback)
- [ ] Plugin System (loader, sandbox, lifecycle, hot reload)
- [ ] Audit Log (hash chaining, tamper protection)
- [ ] Permission Caching (Redis-backed policy cache)

## Phase 2: Agent Runtime

- [ ] Agent Lifecycle (state machine, context assembly)
- [ ] Memory Engine (6-layer architecture, vector search)
- [ ] Model Router (multi-provider, failover, BYOK)
- [ ] Artifact Store (content-addressable, versioned)

## Phase 3: Core Workforce

- [ ] Researcher Agent
- [ ] Architect Agent
- [ ] Frontend Engineer Agent
- [ ] Backend Engineer Agent
- [ ] QA Agent
- [ ] Memory Manager Agent
- [ ] Sentinel Agent

## Phase 4: Security & Observability

- [ ] Security Engine (8 modules)
- [ ] Observability Platform (logging, metrics, tracing)
- [ ] Cost Tracking

## Phase 5: Frontend

- [ ] Mission Control Dashboard
- [ ] Browser IDE
- [ ] Visual Canvas

## Phase 6: Deployment & Production

- [ ] Production Docker
- [ ] CI/CD Pipeline
- [ ] Load Testing
- [ ] Security Hardening

## Phase 7: Public Beta

- [ ] Onboarding Flow
- [ ] Plugin Marketplace
- [ ] Billing Integration

## Phase 8: Enterprise

- [ ] Multi-Tenant
- [ ] SSO/SAML
- [ ] Compliance (SOC2, GDPR)
- [ ] On-Premise Deployment

---

See [Implementation Roadmap](docs/volt-os/IMPLEMENTATION_ROADMAP.md) for detailed milestones.
