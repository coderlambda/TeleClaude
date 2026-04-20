#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p proxy/logs run

if [[ -f run/static.pid ]] && kill -0 "$(cat run/static.pid)" 2>/dev/null; then
  echo "Static server already running on 127.0.0.1:8081"
else
  setsid python3 -m http.server 8081 --bind 127.0.0.1 --directory serve \
    > proxy/logs/static.log 2>&1 < /dev/null &
  echo "$!" > run/static.pid
  echo "Started static server on 127.0.0.1:8081"
fi

if [[ -f run/api.pid ]] && kill -0 "$(cat run/api.pid)" 2>/dev/null; then
  echo "API server already running on 127.0.0.1:3101"
else
  setsid node backend/server.mjs > proxy/logs/api.log 2>&1 < /dev/null &
  echo "$!" > run/api.pid
  echo "Started API server on 127.0.0.1:3101"
fi

if [[ -f proxy/logs/nginx.pid ]] && kill -0 "$(cat proxy/logs/nginx.pid)" 2>/dev/null; then
  nginx -p "$ROOT_DIR/proxy" -c nginx.conf -s reload
  echo "Reloaded Nginx reverse proxy on 127.0.0.1:8090"
else
  nginx -p "$ROOT_DIR/proxy" -c nginx.conf
  echo "Started Nginx reverse proxy on 127.0.0.1:8090"
fi
