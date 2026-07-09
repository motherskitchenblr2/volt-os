# DEMO_SETUP.md — VOLT OS

Version: 1.0
Status: LOCKED

---

## Demo Workflow

1. Open Mission Control
2. Click "New Project"
3. Enter: "Build a restaurant management web application"
4. Click "Start Workflow"
5. Watch execution in real-time
6. Download generated artifacts

---

## Demo Features

### Mission Control Views
- **Dashboard** — Platform health, active pipelines
- **Pipelines** — Workflow execution status
- **Agents** — Agent health and capabilities
- **Events** — Real-time event stream

### Artifact Download
- requirements.md
- architecture.md
- adr-001.md
- code/ (Next.js application)

---

## Limitations

- No authentication required
- No persistent projects (demo only)
- No custom models (uses demo providers)
- No billing (free tier)
- Rate limited (10 requests/minute)

---

## Troubleshooting

### Workflow fails to start
- Check backend health: `GET /health`
- Check Redis connection
- Check model provider availability

### Events not showing
- Check WebSocket connection
- Check browser console for errors
- Try refreshing the page

### Artifacts not downloadable
- Check memory engine health
- Check storage permissions
- Try running workflow again
