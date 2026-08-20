#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8765}"
LOG="$(mktemp)"
DOM="$(mktemp)"
trap 'kill "${SERVER_PID:-}" 2>/dev/null || true; rm -f "$LOG" "$DOM"' EXIT

python3 -m http.server "$PORT" --bind 127.0.0.1 >"$LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PORT}/songs/chopin-nocturne/" >/dev/null; then
    break
  fi
  sleep 0.1
done

CHROME=""
for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
  if command -v "$candidate" >/dev/null 2>&1; then
    CHROME="$candidate"
    break
  fi
done
if [[ -z "$CHROME" ]]; then
  echo "No Chrome/Chromium binary found on runner" >&2
  exit 1
fi

"$CHROME" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --virtual-time-budget=3000 \
  --dump-dom \
  "http://127.0.0.1:${PORT}/songs/chopin-nocturne/" >"$DOM"

if grep -q '>Loading…<' "$DOM"; then
  echo "Player remained stuck on Loading…" >&2
  exit 1
fi
if grep -q '>Could not load song JSON.<' "$DOM"; then
  echo "Player failed to load song JSON" >&2
  exit 1
fi
if ! grep -q 'class="section-block"' "$DOM"; then
  echo "Player rendered no section blocks" >&2
  exit 1
fi
if ! grep -q 'id="midi"' "$DOM"; then
  echo "MIDI control missing from rendered page" >&2
  exit 1
fi
if ! grep -q 'id="orchestraPanel"' "$DOM"; then
  echo "Orchestration panel did not initialize" >&2
  exit 1
fi

echo "Browser smoke test passed using $CHROME"
