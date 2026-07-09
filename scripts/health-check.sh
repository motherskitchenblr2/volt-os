#!/bin/bash

# Health check script for VOLT OS

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"

echo "=== VOLT OS Health Check ==="
echo ""

# Check backend
echo "Checking backend health..."
if curl -f "$BACKEND_URL/health" > /dev/null 2>&1; then
    echo "  ✓ Backend: healthy"
else
    echo "  ✗ Backend: unhealthy"
    exit 1
fi

# Check database
echo "Checking database connection..."
if curl -f "$BACKEND_URL/api/health/database" > /dev/null 2>&1; then
    echo "  ✓ Database: connected"
else
    echo "  ✗ Database: disconnected"
    exit 1
fi

# Check Redis
echo "Checking Redis connection..."
if curl -f "$BACKEND_URL/api/health/redis" > /dev/null 2>&1; then
    echo "  ✓ Redis: connected"
else
    echo "  ✗ Redis: disconnected"
    exit 1
fi

echo ""
echo "=== All health checks passed ==="
