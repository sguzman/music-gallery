# Music Gallery

A static, data-driven gallery of simplified steel-string acoustic guitar melodies.

## Design goals

- Melody-first arrangements: preserve the recognizable melodic spine and remove accompaniment.
- Fret number is the primary instruction.
- Box color encodes left-hand position: blue 1–3, green 3–5, purple 6–8, orange/red 8–10, neutral for open strings.
- Uniform note boxes; horizontal spacing carries attack timing.
- Synchronized WebAudio playback with steel-string guitar, piano, celesta, and combinations where appropriate.
- Section isolation, looping, note audition, keyboard stepping, salvage anchors, and Standard MIDI File export.
- Rich searchable JSON metadata across musical, historical, technical, provenance, and practice dimensions.
- Three-finger-friendly arrangements: no pinky is assumed by the practice data.

## Repository layout

```text
index.html                    Searchable catalog
assets/css/base.css           Shared visual system
assets/css/catalog.css        Catalog/search layout
assets/css/song.css           Interactive tablature layout
assets/js/catalog.js          Search, filters, sorting
assets/js/audio.js            WebAudio instruments + MIDI export
assets/js/song-render.js      Generic six-string renderer
assets/js/song-page.js        Playback/looping/interaction controller
data/catalog.json             Fast searchable summaries
data/song.schema.json         JSON Schema for song files
data/songs/*.json             Canonical rich metadata + notation
scripts/build.py              Regenerates catalog + song wrappers
templates/song.html           Shared wrapper template
songs/<slug>/index.html       Thin shareable song pages
.github/workflows/pages.yml   GitHub Pages deploy workflow
```

## Song JSON

Each song is one rich JSON object. Identity, origin, arrangement constraints, musical settings, playback capabilities, taxonomy, search terms, provenance, confidence, presentation, statistics, and the actual practice notation live together.

To keep public JSON compact without losing semantics, note events use a documented column encoding:

```json
{
  "eventEncoding": {
    "note": ["string","fret","position","start","duration","anchor"],
    "rest": ["rest","start","duration"]
  }
}
```

Example note:

```json
["e",5,"mid",0,1,1]
```

means high-e string, fret 5, green/mid hand position, attack at unit 0, duration 1 unit, and a salvage anchor. MIDI pitch is losslessly derived from the standard-tuning string plus fret by the runtime. `start` and `duration` use the song's declared `musical.tempoUnit`; `unitsPerQuarter` makes MIDI export unambiguous.

## Adding a song

1. Copy an existing `data/songs/<slug>.json`.
2. Fill in identity/origin/arrangement/musical/taxonomy/search/provenance metadata.
3. Add sections, practice groups, and compact events.
4. Run `python3 scripts/build.py`.

The build script refreshes stats/search text, regenerates `data/catalog.json`, and creates the shareable `songs/<slug>/index.html` wrapper. The Pages workflow runs the build again before deployment.

## Data quality

The alternate HTML apps supplied during the redesign were used as visual references only. Their defective note payloads were not treated as canonical. Each song JSON keeps separate note-confidence and timing-confidence metadata plus a timing method, so reconstruction uncertainty remains visible and filterable.

## Local preview

```bash
python3 scripts/build.py
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

The included Actions workflow deploys the repository root. In repository **Settings → Pages**, set **Source** to **GitHub Actions** once. Pushes to `main` then deploy automatically.
