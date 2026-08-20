# Music Gallery — Song Intake & Verification Contract

This document defines how a new song is allowed into Music Gallery and what the timing-confidence labels mean.

## Goal

Every page separates four independent layers:

1. **Source music truth** — pitch, attack time, duration, meter, tempo markings, phrasing, and original parts.
2. **Practice arrangement** — the reduced steel-string guitar fingering used for learning the recognizable melody.
3. **Orchestration** — which playback instrument is assigned to each simultaneous part or section.
4. **Presentation & metadata** — search facets, provenance, difficulty, colors, tags, and page layout.

A visual or playback improvement must never silently change the source-music layer.

## Preferred source hierarchy

Use the highest available source and retain its URL/provenance in the song JSON.

1. Composer/publisher score, official score, official MIDI/MusicXML, or game data where legally usable.
2. Public-domain engraved score or reputable edition (IMSLP, Mutopia, etc.).
3. Reputable full-score transcription with explicit meter and rhythmic notation.
4. High-quality MIDI/MusicXML transcription cross-checked against the recording.
5. Official recording with manually measured or machine-assisted onset/duration timing.
6. Community tab/lead sheet only as a cross-check or when nothing better exists.
7. Ear-only approximation is last resort and must remain marked low confidence.

## Timing rules

- Store note attacks and durations as explicit numeric timing units.
- `unitsPerQuarter` defines the resolution of those units relative to a quarter note.
- Normalize site `defaultBpm` to a **quarter-note equivalent**. If a score marks another unit, preserve the original marking in `tempoUnit` / provenance. Example: eighth note = 132 becomes quarter-note equivalent = 66 while `unitsPerQuarter = 2`.
- Do not infer a held-note duration from the distance to the next note when the source supplies a written duration.
- Do not shorten every note by an arbitrary playback gate. The player defaults to 100% of the notated duration; articulation is a user-controlled playback choice.
- Tuplets, dotted values, ties, pickups, fermatas, tempo changes, and rests must be represented intentionally rather than flattened into a generic step grid.
- A simplified arrangement may omit notes, but retained notes keep source-grounded attack/duration values unless the simplification is explicitly documented.

## Confidence meanings

### High timing confidence

Requires a score/MIDI/MusicXML/timestamp/audio-derived source and an event-by-event cross-check of the section actually published on the site. A correct BPM alone is not enough.

### Medium timing confidence

The piece is score/MIDI guided, but the simplified reduction has not yet been checked event-by-event against every retained note or contains deliberate practice simplifications.

### Low timing confidence

Timing is ear-guided, inherited from an old practice grid, or otherwise not sufficiently sourced. Low-confidence timing is considered technical debt and should not be presented as authoritative.

## New-song workflow

1. Identify the exact composition/version/recording.
2. Collect authoritative score/MIDI/MusicXML/recording references.
3. Establish meter, event timing resolution, tempo marking(s), pickups, and section boundaries.
4. Extract or transcribe the source melody/parts with exact attacks and durations.
5. Cross-check at least one independent source when practical.
6. Create the simplified steel-string fingering without changing the verified clock.
7. Mark salvage/anchor notes separately from the full melody.
8. Add simultaneous `parts` when the song benefits from mini-orchestra playback; each part gets a default timbre and can be reassigned by the user.
9. Populate rich metadata and provenance.
10. Run `python3 scripts/validate.py` and `python3 scripts/build.py`.
11. Audition WebAudio playback and exported MIDI against the source before raising timing confidence.
12. Deploy through GitHub Pages only after validation passes.

## What the user needs to provide

A song title is enough to start. A specific recording/link/file is better when multiple versions exist. Optional preferences: desired length, difficulty, whether the goal is melody-only or multi-part, and any guitar fret/finger constraints.

If no authoritative symbolic score exists, the intake process explicitly says so and uses the best available recording/transcription evidence instead of pretending guessed timing is exact.
