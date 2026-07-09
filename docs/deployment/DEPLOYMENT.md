# DEPLOYMENT.md — VOLT OS

Version: 1.0
Status: LOCKED

---

## Overview

VOLT OS demo deployment for public demonstration.

**NOT production. NOT multi-tenant SaaS. NOT enterprise.**

---

## Deployment Targets

| Component | Platform | URL Pattern |
|-----------|----------|-------------|
| Frontend | Vercel | `*.vercel.app` |
| Backend | Railway | `*.up.railway.app` |
| Database | Railway | Internal |
| Cache | Railway | Internal |
| Storage | Local/S3 | — |

---

## Local Development

### Prerequisites
- Docker Desktop
- Node.js 20+
- pnpm 8+

### Start Services

```bash
# Start all services
docker-compose up -d

# Start with logs
docker-compose up

# Start specific service
docker-compose up postgres redis backend
```

### Available Services

| Service | Port | URL |
|---------|------|-----|
| Backend API | 3000 | http://localhost:3000 |
| Mission Control | 3333 | http://localhost:3333 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |

---

## Production Deployment

### Vercel (Frontend)

1. Connect GitHub repository
2. Set build command: `cd packages/mission-control && pnpm build`
3. Set output directory: `packages/mission-control/.next`
4. Add environment variables (see ENVIRONMENT_VARIABLES.md)

### Railway (Backend)

1. Create new project
2. Connect GitHub repository
3. Add service: Dockerfile
4. Add PostgreSQL plugin
5. Add Redis plugin
6. Set environment variables

---

## Health Checks

### Backend Health
```
GET /health
Response: { "status": "healthy", "services": {...} }
```

### Database Health
```
POST /api/health/database
Response: { "connected": true, "latencyMs": 5 }
```

### Redis Health
```
POST /api/health/redis
Response: { "connected": true, "latencyMs": 2 }
```

---

## Graceful Shutdown

1. Stop accepting new requests
2. Wait for in-flight requests (30s timeout)
3. Close database connections
4. Close Redis connections
5. Flush event bus
6. Exit

---

## Backup

### Database
```bash
pg_dump -h localhost -U volt volt_os > backup_$(date +%Y%m%d).sql
```

### Redis
```bash
redis-cli BGSAVE
cp dump.rdb backup_$(date +%Y%m%d).rdb
```
