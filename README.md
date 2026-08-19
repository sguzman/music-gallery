# Music Gallery

A static, data-driven gallery of simplified steel-string acoustic guitar melodies.

## Design goals

- Melody-first arrangements: keep the recognizable melodic spine, remove accompaniment.
- Fret number is the primary instruction.
- Box color encodes left-hand position:
  - blue: frets 1–3
  - green: frets 3–5
  - purple: frets 6–8
  - orange/red: frets 8–10
  - neutral: open string
- Uniform note boxes; horizontal spacing carries attack timing.
- Synchronized WebAudio playback with guitar, piano, celesta, or combinations where supported.
- Section isolation, looping, note audition, keyboard stepping, salvage anchors, and MIDI export.
- Rich JSON metadata so the catalog can search/filter across musical, historical, technical, and practice dimensions.

## Repository layout

```text
index.html                  Searchable catalog
assets/css/site.css         Shared visual system
assets/js/catalog.js        Search, filters, sorting
assets/js/song-page.js      Generic tab renderer + playback + MIDI
data/catalog.json           Fast index summaries
data/song.schema.json       JSON Schema for song files
data/songs/*.json           Canonical song metadata + note/timing data
scripts/build.py             Regenerates catalog + song wrappers
templates/song.html          Shared wrapper template
songs/<slug>/index.html     Thin shareable song pages
.github/workflows/pages.yml GitHub Pages deploy workflow
```

## Adding a song

1. Copy an existing `data/songs/<slug>.json`.
2. Fill in identity/origin/arrangement/musical/taxonomy/search/provenance metadata.
3. Add sections, measures/practice-groups, and events.
4. Run `python scripts/build.py`.

The build script regenerates `data/catalog.json` and the shareable `songs/<slug>/index.html` wrapper automatically. The Pages workflow runs it again before deployment.

## Event model

A note event stores both musical and guitar-specific information:

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

`start` and `duration` are measured in the song's declared tempo unit. `unitsPerQuarter` makes MIDI export unambiguous even when the practice clock is an eighth-note pulse.

## Data quality

The uploaded alternate HTML apps were treated as visual references only. Their note payloads were intentionally not used as canonical data. Each song JSON has separate note and timing confidence plus a timing-method field so imperfect reconstructions are visible and filterable rather than silently treated as authoritative.

## Local preview

Any static HTTP server works:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

The repository includes an Actions workflow that deploys the repository root as a Pages artifact. In repository **Settings → Pages**, set **Source** to **GitHub Actions** once. After that, pushes to `main` deploy automatically.
