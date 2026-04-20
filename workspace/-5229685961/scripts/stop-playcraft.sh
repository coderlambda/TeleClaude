#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f proxy/logs/nginx.pid ]] && kill -0 "$(cat proxy/logs/nginx.pid)" 2>/dev/null; then
  nginx -p "$ROOT_DIR/proxy" -c nginx.conf -s quit
  echo "Stopped Nginx reverse proxy"
else
  echo "Nginx reverse proxy is not running"
fi

if [[ -f run/static.pid ]] && kill -0 "$(cat run/static.pid)" 2>/dev/null; then
  kill "$(cat run/static.pid)"
  rm -f run/static.pid
  echo "Stopped static server"
else
  echo "Static server is not running"
fi

if [[ -f run/api.pid ]] && kill -0 "$(cat run/api.pid)" 2>/dev/null; then
  kill "$(cat run/api.pid)"
  rm -f run/api.pid
  echo "Stopped API server"
else
  echo "API server is not running"
fi
