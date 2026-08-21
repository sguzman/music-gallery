#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8765}"
LOG="$(mktemp)"
CHOPIN_DOM="$(mktemp)"
CANON_DOM="$(mktemp)"
SUGAR_DOM="$(mktemp)"
MIDI_DOM="$(mktemp)"
INTERACTION_DOM="$(mktemp)"
trap 'kill "${SERVER_PID:-}" 2>/dev/null || true; rm -f "$LOG" "$CHOPIN_DOM" "$CANON_DOM" "$SUGAR_DOM" "$MIDI_DOM" "$INTERACTION_DOM"' EXIT

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
  local budget="${3:-3500}"
  "$CHROME" \
    --headless=new \
    --no-sandbox \
    --disable-gpu \
    --autoplay-policy=no-user-gesture-required \
    --virtual-time-budget="$budget" \
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

dump_page "http://127.0.0.1:${PORT}/songs/canon-in-d/" "$CANON_DOM" 4500
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
if ! grep -q 'id="ensembleTimeline"' "$CANON_DOM"; then
  echo "Canon source-score timeline did not render" >&2
  exit 1
fi
if [[ "$(grep -o 'class="ensemble-track' "$CANON_DOM" | wc -l)" -lt 4 ]]; then
  echo "Canon source-score timeline has fewer than four lanes" >&2
  exit 1
fi
if ! grep -q 'id="ensembleMidi"' "$CANON_DOM"; then
  echo "Dedicated multitrack source MIDI control is missing" >&2
  exit 1
fi

dump_page "http://127.0.0.1:${PORT}/songs/sugar-plum-fairy/" "$SUGAR_DOM" 4500
assert_base_player "$SUGAR_DOM"
for part in 'Violin I' 'Violin II' 'Celesta'; do
  if ! grep -q ">$part<" "$SUGAR_DOM"; then
    echo "Sugar Plum source ensemble is missing $part" >&2
    exit 1
  fi
done
if ! grep -q '>3 source parts<' "$SUGAR_DOM"; then
  echo "Sugar Plum source-part badge is missing or incorrect" >&2
  exit 1
fi
if ! grep -q 'id="ensembleTimeline"' "$SUGAR_DOM"; then
  echo "Sugar Plum source-score timeline did not render" >&2
  exit 1
fi
if [[ "$(grep -o 'class="ensemble-track' "$SUGAR_DOM" | wc -l)" -lt 3 ]]; then
  echo "Sugar Plum source-score timeline has fewer than three lanes" >&2
  exit 1
fi
if ! grep -q '>62<' "$SUGAR_DOM"; then
  echo "Sugar Plum source tempo 62 is not visible in the rendered orchestration UI" >&2
  exit 1
fi
if [[ "$(grep -o 'data-part="celesta"' "$SUGAR_DOM" | wc -l)" -lt 10 ]]; then
  echo "Sugar Plum celesta polyphonic event blocks did not render" >&2
  exit 1
fi

dump_page "http://127.0.0.1:${PORT}/scripts/ensemble-midi-smoke.html" "$MIDI_DOM" 4500
if ! grep -q 'id="result" data-status="pass"' "$MIDI_DOM"; then
  echo "Multitrack MIDI browser smoke failed" >&2
  cat "$MIDI_DOM" >&2
  exit 1
fi
if ! grep -q 'data-format="1"' "$MIDI_DOM" || ! grep -q 'data-tracks="5"' "$MIDI_DOM"; then
  echo "Canon source MIDI is not format 1 with five tracks" >&2
  exit 1
fi

dump_page "http://127.0.0.1:${PORT}/scripts/player-interaction-smoke.html" "$INTERACTION_DOM" 8000
if ! grep -q 'id="result" data-status="pass"' "$INTERACTION_DOM"; then
  echo "Canon interaction smoke failed" >&2
  cat "$INTERACTION_DOM" >&2
  exit 1
fi

echo "Browser smoke tests passed using $CHROME (Chopin + Canon + Sugar Plum source timelines + interactions + multitrack MIDI)"
