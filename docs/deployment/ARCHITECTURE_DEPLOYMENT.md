# ARCHITECTURE_DEPLOYMENT.md — VOLT OS

Version: 1.0
Status: LOCKED

---

## Deployment Architecture

```
Internet
    ↓
Vercel (Frontend)
    ↓ HTTPS
Railway (Backend)
    ↓
PostgreSQL + Redis
```

---

## Component Mapping

| Component | Deployment | Scaling |
|-----------|-----------|---------|
| Mission Control | Vercel | Auto-scaling |
| API Gateway | Railway | Single instance |
| Event Bus | Railway | Single instance |
| Pipeline Engine | Railway | Single instance |
| Agent Runtime | Railway | Single instance |
| Memory Engine | Railway | Single instance |
| Model Router | Railway | Single instance |
| Security Engine | Railway | Single instance |
| PostgreSQL | Railway | Managed |
| Redis | Railway | Managed |

---

## Network

### Vercel → Railway
- HTTPS only
- CORS: `*.vercel.app`
- Rate limiting: 100 req/min

### Railway Internal
- Docker network
- Service discovery via Docker Compose
- No external access to PostgreSQL/Redis

---

## Security

### External
- HTTPS everywhere
- CORS restricted
- Rate limiting enabled
- No secrets in client

### Internal
- Service-to-service: API key
- Database: connection string
- Redis: password auth

---

## Monitoring

### Health Checks
- Backend: `/health` every 30s
- Database: connection check every 60s
- Redis: ping every 60s

### Alerts
- Backend down: immediate
- Database slow: > 100ms
- Memory high: > 80%

---

## Backup

### Database
- Automated daily backups
- 7-day retention
- Manual restore via Railway dashboard

### Redis
- BGSAVE every hour
- 24-hour retention
