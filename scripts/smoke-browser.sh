#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8765}"
LOG="$(mktemp)"
CHOPIN_DOM="$(mktemp)"
CANON_DOM="$(mktemp)"
trap 'kill "${SERVER_PID:-}" 2>/dev/null || true; rm -f "$LOG" "$CHOPIN_DOM" "$CANON_DOM"' EXIT

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

dump_page() {
  local url="$1"
  local output="$2"
  "$CHROME" \
    --headless=new \
    --no-sandbox \
    --disable-gpu \
    --virtual-time-budget=3000 \
    --dump-dom \
    "$url" >"$output"
}

assert_base_player() {
  local dom="$1"
  if grep -q '>Loading…<' "$dom"; then
    echo "Player remained stuck on Loading…" >&2
    exit 1
  fi
  if grep -q '>Could not load song JSON.<' "$dom"; then
    echo "Player failed to load song JSON" >&2
    exit 1
  fi
  if ! grep -q 'class="section-block"' "$dom"; then
    echo "Player rendered no section blocks" >&2
    exit 1
  fi
  if ! grep -q 'id="midi"' "$dom"; then
    echo "MIDI control missing from rendered page" >&2
    exit 1
  fi
  if ! grep -q 'id="orchestraPanel"' "$dom"; then
    echo "Orchestration panel did not initialize" >&2
    exit 1
  fi
}

dump_page "http://127.0.0.1:${PORT}/songs/chopin-nocturne/" "$CHOPIN_DOM"
assert_base_player "$CHOPIN_DOM"

dump_page "http://127.0.0.1:${PORT}/songs/canon-in-d/" "$CANON_DOM"
assert_base_player "$CANON_DOM"
for part in 'Violin I' 'Violin II' 'Violin III' 'Violoncello'; do
  if ! grep -q ">$part<" "$CANON_DOM"; then
    echo "Canon source ensemble is missing $part" >&2
    exit 1
  fi
done
if ! grep -q '>▶ Play source ensemble<' "$CANON_DOM"; then
  echo "Canon source-ensemble playback control is missing" >&2
  exit 1
fi
if ! grep -q 'data-playback-group="ensemble"' "$CANON_DOM"; then
  echo "Canon source parts were not isolated into the ensemble playback group" >&2
  exit 1
fi
if ! grep -q '>4 source parts<' "$CANON_DOM"; then
  echo "Canon source-part badge is missing or incorrect" >&2
  exit 1
fi

echo "Browser smoke tests passed using $CHROME (Chopin + Canon ensemble)"
