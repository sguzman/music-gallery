# Music Gallery

A static, data-driven gallery of simplified steel-string acoustic guitar melodies, with optional source-derived ensemble playback kept separate from the practice reductions.

## Design goals

- Melody-first guitar arrangements: keep the recognizable melodic spine, remove accompaniment.
- Fret number is the primary guitar instruction.
- Box color encodes left-hand position:
  - blue: frets 1–3
  - green: frets 3–5
  - purple: frets 6–8
  - orange/red: frets 8–10
  - neutral: open string
- Uniform note boxes; horizontal spacing carries exact attack timing.
- Synchronized WebAudio playback with a broad General-MIDI-style orchestral palette.
- Section isolation, looping, note audition, keyboard stepping, salvage anchors, and MIDI export.
- Rich JSON metadata so the catalog can search/filter across musical, historical, technical, and practice dimensions.
- Source-score ensembles are provenance-separated from guitar practice reductions rather than silently merged with them.

## Repository layout

```text
index.html                         Searchable catalog
assets/css/site.css                Shared visual system
assets/css/enhancements.css        Player-v2 orchestration/metadata additions
assets/js/catalog.js               Search, filters, sorting
assets/js/song-page-v2.js          Generic guitar renderer + playback controls
assets/js/ensemble-model.js        Generic source-ensemble timeline model
assets/js/ensemble-midi.js         SMF format-1 source-ensemble MIDI writer
assets/js/ensemble-visual.js       Generic source-score lane visualization
data/catalog.json                  Fast index summaries
data/song.schema.json              Generated song schema
data/ensemble.schema.json          Declarative source-ensemble schema
data/songs/*.json                  Canonical song metadata + practice data
data/ensembles/*.json              Compact source-derived ensemble declarations
data/timing-audits/*.json          Per-song timing corrections/provenance
scripts/build.py                   Applies timing audits + ensemble overlays
scripts/validate.py                Structural timing/playback validation
templates/song.html                Shared wrapper template
songs/<slug>/index.html            Thin shareable song pages
.github/workflows/player-v2-ci.yml Experimental player CI
.github/workflows/pages.yml        Production Pages deploy workflow
```

## Adding a practice song

1. Copy an existing `data/songs/<slug>.json`.
2. Fill in identity/origin/arrangement/musical/taxonomy/search/provenance metadata.
3. Add sections, measures/practice-groups, and events.
4. Add a timing audit when source verification changes the legacy event grid or confidence.
5. Run `python scripts/build.py` and `python scripts/validate.py`.

The build script regenerates `data/catalog.json` and the shareable `songs/<slug>/index.html` wrapper automatically.

## Practice event model

A guitar note event stores both musical and guitar-specific information:

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

`start` and `duration` are measured in the song's declared timing units. `unitsPerQuarter` makes playback and MIDI conversion unambiguous even when the event grid is finer than a quarter note.

## Source ensembles

A source ensemble is a different object from the guitar reduction. It lives in `data/ensembles/<slug>.json`; the builder materializes it as `sourceDerived` parts in a separate playback group.

This prevents two distinct claims from being conflated:

- **practice reduction:** a playable educational guitar simplification;
- **source ensemble:** independently verified score-derived instrumental parts.

A source ensemble can therefore have high confidence without silently upgrading the guitar reduction's note/timing confidence.

### Sequential shorthand

For a monophonic measure with no rests, a pattern can use compact `[pitch, duration]` entries. The entries are contiguous and must exactly fill the measure:

```json
[
  ["F#5", 1],
  ["E5", 1],
  ["D5", 1],
  ["C#5", 1]
]
```

Canon in D uses this compact form.

### Explicit timed events

Orchestral writing immediately needs rests and simultaneous notes. A pattern measure may instead use explicit events:

```json
[
  {"pitch":"G7", "start":0.5, "duration":0.125},
  {"pitch":"B6", "start":0.5, "duration":0.125},
  {"pitch":"E6", "start":0.5, "duration":0.125}
]
```

Here `0.0–0.5` is a real rest and the three events at `0.5` form a chord. Explicit events may leave gaps and overlap, but every event must remain inside its declared measure. A single measure may use either sequential shorthand or explicit events, never a mixture of both.

Dance of the Sugar Plum Fairy is the first A5 proof of this representation: its six-bar source excerpt contains pizzicato Violin I and II rests plus polyphonic Celesta chords, and it renders through the same generic ensemble player used by Canon. The excerpt is intentionally limited to those three individually checked parts; it does not imply that the omitted winds, brass, or remaining string families have already been transcribed.

## Ensemble authoring contract

1. Select an identifiable source score/MIDI/MusicXML edition and state the exact excerpt scope.
2. Author only the parts actually verified. Omission is preferable to invented orchestration.
3. Use concert pitches in ensemble declarations. Transposed source parts must be normalized deliberately rather than copied blindly.
4. Preserve literal attack times and durations. Do not extend a note merely to fill a rest.
5. Use explicit events whenever a measure contains rests, chords, or independently timed attacks.
6. Keep the source ensemble in its own playback group unless a combined arrangement is intentionally authored.
7. Record confidence, method, and scope. “High” is reserved for event-level verification against an authoritative symbolic source.
8. Add a deterministic per-piece test for entrances, durations, pitches, polyphony, source tempo, and provenance isolation.
9. Let the generic browser/MIDI tests prove that the renderer can consume the data without song-specific code.

## MIDI behavior

Practice MIDI and source-ensemble MIDI follow the currently selected playback object. Source ensembles export as SMF format 1: one tempo track plus one named track for every enabled source part, preserving each part's current instrument/program assignment.

## Timing quality

A verified tempo marking is not the same thing as a verified event grid. The repository keeps those claims separate. Timing audits state where attacks, durations, meter, and tempo came from and what still requires review.

The uploaded alternate HTML apps were treated as visual references only. Their note payloads were intentionally not used as canonical musical data.

## Local preview

Any static HTTP server works:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

For the experimental player, run the build and checks before previewing:

```bash
python scripts/build.py
python scripts/test-canon-ensemble.py
python scripts/test-sugar-plum-ensemble.py
python scripts/validate.py
bash scripts/smoke-browser.sh
```

## Branch policy

`main` is the stable GitHub Pages production branch. Experimental player/orchestration work stays on `player-v2` until its PR-triggered CI is green and the integration is explicitly approved for promotion.

The production Pages workflow remains intentionally simple and does not use the experimental CI as a deployment-time test bench.
