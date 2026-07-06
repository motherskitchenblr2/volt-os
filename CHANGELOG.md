# Changelog

All notable changes to VOLT OS will be documented in this file.

## [0.1.0-alpha] — 2026-07-07

### Added
- Monorepo scaffold (pnpm workspaces + Turborepo)
- Docker Compose stack (PostgreSQL 16 + pgvector, Redis 7, MinIO, Prometheus, Grafana)
- Drizzle ORM schema (14 core tables)
- Event Bus: in-process transport, Redis pub/sub, outbox pattern, schema registry, DLQ, sequencing
- Event Bus production hardening: extended envelope, metrics, performance documentation
- API Gateway: Fastify, REST + WebSocket, JWT auth, rate limiting, health probes, OpenAPI
- CI/CD pipelines (GitHub Actions)
- Architecture fitness tests (10 automated rules)
- Development standards and templates
