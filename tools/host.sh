#!/usr/bin/env bash
# Hosts the Explorer from this computer for people elsewhere, then stops everything together on Ctrl+C.
#
# It builds the front end, starts the back end and the built page on this computer only (127.0.0.1), and opens a
# public HTTPS tunnel to the page, so only the tunnel can reach it from outside. On macOS it keeps the computer
# awake while it runs.
#
#   tools/host.sh                      # Cloudflare quick tunnel (no account): prints https://<random>.trycloudflare.com
#   tools/host.sh --tunnel ngrok       # ngrok (free account, `ngrok config add-authtoken ...` once)
#   tools/host.sh --tunnel none        # this computer only: http://127.0.0.1:4173
#   tools/host.sh --live               # also switch the live lookup on (6 fetches an hour, shared by every visitor)
#
# Options: --api-port N (default 8000), --web-port N (default 4173), --no-build (serve the existing frontend/dist).
# Python: the active conda environment (`conda activate cos30049-a3`), or HOST_PYTHON=/path/to/python.
# Written for macOS's bash 3.2; Linux should work. On Windows use the README's steps instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TUNNEL=cloudflare
LIVE=off
BUILD=yes
API_PORT=8000
WEB_PORT=4173
PY="${HOST_PYTHON:-python}"

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --tunnel) TUNNEL="${2:-}"; shift 2 ;;
    --live) LIVE=on; shift ;;
    --no-build) BUILD=no; shift ;;
    --api-port) API_PORT="${2:-}"; shift 2 ;;
    --web-port) WEB_PORT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done
case "$TUNNEL" in cloudflare|ngrok|none) ;; *) echo "--tunnel takes cloudflare, ngrok or none" >&2; exit 2 ;; esac

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[31mStopped:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- checks before anything starts ----
"$PY" -c 'import fastapi, uvicorn' 2>/dev/null \
  || fail "'$PY' cannot import FastAPI. Run 'conda activate cos30049-a3' first, or set HOST_PYTHON."
command -v node >/dev/null || fail "Node.js is not installed (README: What you need)."
[ -x "$ROOT/frontend/node_modules/.bin/vite" ] || fail "Front-end packages are missing: run 'cd frontend && npm ci' once."
if [ "$TUNNEL" = cloudflare ]; then
  command -v cloudflared >/dev/null || fail "cloudflared is not installed: 'brew install cloudflared' (or use --tunnel ngrok)."
elif [ "$TUNNEL" = ngrok ]; then
  command -v ngrok >/dev/null || fail "ngrok is not installed: 'brew install ngrok', then 'ngrok config add-authtoken <token>'."
fi
for port in "$API_PORT" "$WEB_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $port is already in use (another Explorer or dev server?). Stop it, or pick another with --api-port/--web-port."
  fi
done

TMPBASE="${TMPDIR:-/tmp}"
LOGS="$(mktemp -d "${TMPBASE%/}/explorer-host.XXXXXX")"
PIDS=""
cleanup() {
  trap - EXIT INT TERM
  echo
  say "Stopping"
  for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
  sleep 1
  for pid in $PIDS; do kill -9 "$pid" 2>/dev/null || true; done
  echo "Stopped. Logs kept in $LOGS"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

wait_for() {  # wait_for <url> <seconds> <pid> <log>: true when the URL answers 200, fails early if the process dies
  local url="$1" secs="$2" pid="$3" log="$4" i=0
  while [ "$i" -lt "$secs" ]; do
    curl -fs -o /dev/null --max-time 5 "$url" && return 0
    kill -0 "$pid" 2>/dev/null || { tail -20 "$log" >&2; return 1; }
    sleep 1; i=$((i + 1))
  done
  tail -20 "$log" >&2
  return 1
}

# ---- 1. build the page ----
if [ "$BUILD" = yes ]; then
  say "Building the front end"
  (cd "$ROOT/frontend" && VITE_API_MODE=http npm run -s build) > "$LOGS/build.log" 2>&1 \
    || { tail -30 "$LOGS/build.log" >&2; fail "the build failed (log: $LOGS/build.log)"; }
fi
[ -f "$ROOT/frontend/dist/index.html" ] || fail "frontend/dist is missing: run without --no-build."

# ---- 2. the back end, on this computer only ----
say "Starting the back end on 127.0.0.1:$API_PORT (live lookup $LIVE)"
(cd "$ROOT/backend" && EXPLORER_LIVE_LOOKUP="$LIVE" exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT") \
  > "$LOGS/api.log" 2>&1 &
API_PID=$!; PIDS="$PIDS $API_PID"
wait_for "http://127.0.0.1:$API_PORT/api/health" 90 "$API_PID" "$LOGS/api.log" || fail "the back end did not start (log: $LOGS/api.log)"

# ---- 3. the built page, which hands /api to the back end ----
say "Serving the page on 127.0.0.1:$WEB_PORT"
(cd "$ROOT/frontend" && VITE_PROXY_TARGET="http://127.0.0.1:$API_PORT" \
  exec ./node_modules/.bin/vite preview --host 127.0.0.1 --port "$WEB_PORT" --strictPort) > "$LOGS/web.log" 2>&1 &
WEB_PID=$!; PIDS="$PIDS $WEB_PID"
wait_for "http://127.0.0.1:$WEB_PORT/api/health" 30 "$WEB_PID" "$LOGS/web.log" || fail "the page server did not start (log: $LOGS/web.log)"

# ---- 4. the tunnel ----
PUBLIC=""
if [ "$TUNNEL" = cloudflare ]; then
  say "Opening a Cloudflare quick tunnel"
  # The page server accepts only its own host name, so the tunnel presents itself as localhost.
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$WEB_PORT" --http-host-header localhost > "$LOGS/tunnel.log" 2>&1 &
  TUN_PID=$!; PIDS="$PIDS $TUN_PID"
  for _ in $(seq 1 60); do
    PUBLIC="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -1 || true)"
    [ -n "$PUBLIC" ] && break
    kill -0 "$TUN_PID" 2>/dev/null || break
    sleep 1
  done
elif [ "$TUNNEL" = ngrok ]; then
  say "Opening an ngrok tunnel"
  ngrok http "$WEB_PORT" --host-header=localhost --log stdout > "$LOGS/tunnel.log" 2>&1 &
  TUN_PID=$!; PIDS="$PIDS $TUN_PID"
  for _ in $(seq 1 30); do
    PUBLIC="$(curl -fs --max-time 2 http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | "$PY" -c 'import json,sys; t=[x["public_url"] for x in json.load(sys.stdin)["tunnels"] if x["public_url"].startswith("https")]; print(t[0] if t else "")' 2>/dev/null || true)"
    [ -n "$PUBLIC" ] && break
    kill -0 "$TUN_PID" 2>/dev/null || break
    sleep 1
  done
fi
if [ "$TUNNEL" != none ]; then
  [ -n "$PUBLIC" ] || { tail -20 "$LOGS/tunnel.log" >&2; fail "the tunnel did not give a link (log: $LOGS/tunnel.log)"; }
  say "Waiting for the link to answer"
  ok=no
  for _ in $(seq 1 45); do
    curl -fs -o /dev/null --max-time 5 "$PUBLIC/api/health" && { ok=yes; break; }
    kill -0 "$TUN_PID" 2>/dev/null || break
    sleep 2
  done
  [ "$ok" = yes ] || echo "The link has not answered yet; it may need another minute (log: $LOGS/tunnel.log)." >&2
fi

# ---- 5. keep the computer awake while this runs (macOS) ----
if command -v caffeinate >/dev/null; then caffeinate -dims -w $$ & PIDS="$PIDS $!"; fi

echo
echo "  The Explorer is running."
[ -n "$PUBLIC" ] && echo "  Share this link:  $PUBLIC"
echo "  On this computer: http://127.0.0.1:$WEB_PORT"
echo "  Logs:             $LOGS"
echo
[ -n "$PUBLIC" ] && echo "  Anyone with the link can use it, and every visitor shares one watchlist."
[ "$LIVE" = on ] && echo "  Live lookup is on: 6 fetches an hour, shared by every visitor, sent from this computer."
echo "  Keep this terminal open and the computer plugged in. Press Ctrl+C to stop everything."
echo

# Stop everything if any part stops on its own.
while :; do
  for pid in $API_PID $WEB_PID ${TUN_PID:-}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "A part of the Explorer stopped on its own (pid $pid); see $LOGS." >&2
      exit 1
    fi
  done
  sleep 3
done
