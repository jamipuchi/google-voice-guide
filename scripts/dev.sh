#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but not installed." >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required but not installed." >&2
  exit 1
fi

free_port() {
  local port="$1"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  echo "Stopping process(es) on port $port: $pids"
  kill $pids 2>/dev/null || true

  for _ in {1..20}; do
    sleep 0.2
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -z "$pids" ]]; then
      return
    fi
  done

  echo "Force killing process(es) on port $port: $pids"
  kill -9 $pids 2>/dev/null || true
}

free_port 5173
free_port 8001

echo "Syncing Python dependencies..."
pnpm adk:sync

echo "Starting hot-reload services..."
echo "Web: http://localhost:5173"
echo "ADK: http://localhost:8001"

pnpm exec concurrently \
  -k \
  -n web,adk \
  -c magenta,green \
  "pnpm --filter @google-voice-guide/web dev" \
  "pnpm adk:dev"
