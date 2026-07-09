# ENVIRONMENT_VARIABLES.md — VOLT OS

Version: 1.0
Status: LOCKED

---

## Required Variables

### Database
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/volt_os` |

### Redis
| Variable | Description | Example |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | `redis://default:pass@host:6379` |

### Security
| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | `your-secret-key-here` |
| `ENCRYPTION_KEY` | AES-256 encryption key | `your-encryption-key` |

### Model Providers
| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |

---

## Optional Variables

### Application
| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Backend port | `3000` |
| `LOG_LEVEL` | Logging level | `info` |

### Vercel
| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://api.up.railway.app` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL | `wss://api.up.railway.app` |

---

## Security Rules

- **NEVER** commit secrets to git
- **NEVER** log secrets
- **ALWAYS** use environment variables
- **ALWAYS** rotate secrets monthly
