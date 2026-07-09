#!/bin/bash

# Backup script for VOLT OS

set -e

DATE=$(date +%Y%m%d)
BACKUP_DIR="./backups"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_USER="${POSTGRES_USER:-volt}"
POSTGRES_DB="${POSTGRES_DB:-volt_os}"

echo "=== VOLT OS Backup ==="
echo ""

mkdir -p "$BACKUP_DIR"

# PostgreSQL backup
echo "Backing up PostgreSQL..."
if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/postgres_$DATE.sql" 2>/dev/null; then
    echo "  ✓ PostgreSQL backup: $BACKUP_DIR/postgres_$DATE.sql"
else
    echo "  ✗ PostgreSQL backup failed"
fi

# Redis backup
echo "Backing up Redis..."
if redis-cli BGSAVE > /dev/null 2>&1; then
    sleep 2
    cp dump.rdb "$BACKUP_DIR/redis_$DATE.rdb" 2>/dev/null && \
        echo "  ✓ Redis backup: $BACKUP_DIR/redis_$DATE.rdb" || \
        echo "  ✗ Redis backup failed"
else
    echo "  ✗ Redis backup failed"
fi

echo ""
echo "=== Backup complete: $BACKUP_DIR ==="
