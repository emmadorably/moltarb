#!/bin/sh
set -e

PGDATA=/var/lib/postgresql/data/pgdata

# Start PostgreSQL
echo "Starting PostgreSQL..."
su postgres -c "pg_isready" 2>/dev/null || {
  # Initialize DB if needed (use subdirectory to avoid lost+found)
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    su postgres -c "initdb -D $PGDATA"
  fi
  su postgres -c "pg_ctl start -D $PGDATA -l /var/log/postgresql.log -w"
}

# Create database and user if they don't exist
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='moltarb'\" | grep -q 1" || \
  su postgres -c "psql -c \"CREATE USER moltarb WITH PASSWORD '${POSTGRES_PASSWORD}';\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='moltarb'\" | grep -q 1" || \
  su postgres -c "psql -c \"CREATE DATABASE moltarb OWNER moltarb;\""

echo "PostgreSQL ready"

# Start MoltArb
echo "Starting MoltArb..."
exec node dist/index.js
