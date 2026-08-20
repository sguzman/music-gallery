# Music Gallery

A static, data-driven gallery of simplified steel-string acoustic guitar melodies, with an experimental source-score ensemble player on `player-v2`.

## Design goals

- Melody-first guitar practice arrangements: keep the recognizable melodic spine, remove accompaniment.
- Fret number is the primary guitar instruction.
- Box color encodes left-hand position:
  - blue: frets 1–3
  - green: frets 3–5
  - purple: frets 6–8
  - orange/red: frets 8–10
  - neutral: open string
- Uniform note boxes; horizontal position is a linear mapping of exact attack time.
- Synchronized WebAudio playback with independently assignable instruments.
- Section isolation, looping, note audition, keyboard stepping, salvage anchors, and MIDI export.
- Rich JSON metadata so the catalog can search/filter across musical, historical, technical, and practice dimensions.
- Provenance boundaries are explicit: a cited source-score ensemble never silently upgrades or rewrites an independent beginner reduction.

## Repository layout

```text
index.html                       Searchable catalog
assets/css/site.css              Shared visual system
assets/css/enhancements.css      v2 orchestra/metadata UI
assets/css/exact-timing.css      Edge gutter for exact-time fret boxes
assets/js/catalog.js             Search, filters, sorting
assets/js/song-page.js           Stable production player
assets/js/song-page-v2.js        Experimental grouped multi-part player
data/catalog.json                Fast index summaries
data/song.schema.json            Generated/runtime song schema
data/ensemble.schema.json        Declarative source-ensemble schema
data/songs/*.json                Canonical practice metadata + note/timing data
data/timing-audits/*.json        Source-grounded timing patches
data/ensembles/*.json            Compact source-score ensemble declarations
scripts/build.py                 Applies audits/ensembles; regenerates catalog/pages
scripts/validate.py              Timing, guitar, MIDI, and group-sync invariants
scripts/test-canon-ensemble.py   Deterministic first multi-part source test
scripts/smoke-player.mjs         Node initialization smoke
scripts/smoke-browser.sh         Real headless-Chrome page smoke
templates/song.html              Shared wrapper template
songs/<slug>/index.html          Thin shareable song pages
.github/workflows/pages.yml      Stable GitHub Pages deploy workflow
.github/workflows/player-v2-ci.yml Experimental branch CI
```

## Adding a practice song

1. Copy an existing `data/songs/<slug>.json`.
2. Fill in identity/origin/arrangement/musical/taxonomy/search/provenance metadata.
3. Add sections, measures/practice-groups, and guitar events.
4. If the rhythm is source-verified independently of the base file, add a focused overlay in `data/timing-audits/<slug>.json` rather than hiding the correction in renderer code.
5. Run `python3 scripts/build.py`, then `python3 scripts/validate.py`.

The build script regenerates `data/catalog.json` and the shareable `songs/<slug>/index.html` wrapper automatically.

## Adding a source ensemble

A source ensemble is **not** an accompaniment automatically attached to the guitar reduction. It is an independent, cited playback timeline. That distinction matters when the practice arrangement is shortened, transposed, simplified, or otherwise not bar-for-bar identical to the source score.

Create `data/ensembles/<slug>.json` using `data/ensemble.schema.json`. The declaration is deliberately generative:

```json
{
  "slug": "example-song",
  "playbackGroup": "ensemble",
  "measureDuration": 4,
  "totalMeasures": 8,
  "patterns": {
    "voice": [
      [["C5", 1], ["D5", 1], ["E5", 2]]
    ]
  },
  "parts": [
    {
      "id": "violin-1",
      "name": "Violin I",
      "defaultInstrument": "violin",
      "delayMeasures": 2,
      "pattern": "voice"
    }
  ]
}
```

The builder converts concert-pitch names to MIDI, expands measure patterns and delays, and materializes synchronized `song.parts`. Source parts use `sourceDerived: true`; the guitar reduction lives in a separate `practice` playback group. The v2 scheduler only mixes parts within one playback group, and MIDI export follows that same boundary.

Canon in D is the reference implementation: its declaration encodes the Mutopia three-violin canon entries after 2, 4, and 6 bars plus the repeated violoncello ground. The source ensemble has its own high-confidence verification scope; the independent beginner guitar reduction retains its own lower timing/note confidence.

## Event model

A guitar practice note stores both musical and instrument-specific information:

```json
{
  "type": "note",
  "string": "e",
  "stringIndex": 0,
  "fret": 5,
  "midi": 69,
  "position": "mid",
  "start": 0,
  "duration": 1,
  "anchor": true
}
```

A generated source-score note may instead retain concert pitch without pretending to have a guitar fingering:

```json
{
  "type": "note",
  "pitch": "F#5",
  "midi": 78,
  "start": 0,
  "duration": 1
}
```

`start` and `duration` are measured in the song's event-grid units. `unitsPerQuarter` maps those units to quarter-note time for playback and MIDI export.

## Data quality

Alternate HTML apps are visual references only unless their musical data is independently verified. Song JSON keeps note and timing confidence separate. Timing-audit overlays record method/provenance, and source ensembles get a separate `verification.ensembleTiming` scope so a trustworthy orchestral source cannot accidentally launder uncertainty in a simplified teaching arrangement.

## Experimental branch checks

`player-v2` CI currently performs:

```text
build timing audits + ensemble declarations
→ Canon 2/4/6-bar entry + ground-bass self-test
→ structural/timing/group synchronization validation
→ JavaScript parse check
→ mock-DOM player initialization
→ real headless-Chrome smoke for Chopin and Canon
```

The stable `main` branch remains isolated from this experimental player until the branch is intentionally integrated.

## Local preview

```bash
python3 scripts/build.py
python3 scripts/validate.py
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Production deployment remains on `main`. The experimental `player-v2` workflow validates the branch but does not replace the stable Pages renderer by itself.
