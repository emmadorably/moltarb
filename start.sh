#!/bin/sh
set -e

# Start PostgreSQL
echo "Starting PostgreSQL..."
su postgres -c "pg_isready" 2>/dev/null || {
  # Initialize DB if needed
  if [ ! -f /var/lib/postgresql/data/PG_VERSION ]; then
    su postgres -c "initdb -D /var/lib/postgresql/data"
  fi
  su postgres -c "pg_ctl start -D /var/lib/postgresql/data -l /var/log/postgresql.log -w"
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
