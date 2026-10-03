# Open Full Rendition Queue

This is a **locked, user-approved corpus** for Musicarium. Every item must end in a usable **Full Rendition**, not merely a Practice derivative.

| # | Specimen | Status |
|---:|---|---|
| 1 | Liszt — Hungarian Rhapsody No. 2, S.244/2 | **processing** |
| 2 | Satie — Gnossienne No. 1 | queued |
| 3 | Satie — Gnossienne No. 2 | queued |
| 4 | Satie — Gnossienne No. 3 | queued |
| 5 | Satie — Gymnopédie No. 1 | queued |
| 6 | Satie — Gymnopédie No. 2 | queued |
| 7 | Satie — Gymnopédie No. 3 | queued |
| 8 | Chopin — Prelude, Op. 28 No. 4 | queued |
| 9 | Chopin — Prelude, Op. 28 No. 20 | queued |
| 10 | Mozart — Dies Irae, K.626 | queued |

## Governance

- Rachmaninoff is explicitly excluded from this queue.
- Grieg is explicitly excluded from this queue.
- Process strictly in the order above.
- A Practice-only page does **not** complete an item.
- Do not advance an item on the basis of source availability alone; the Full Rendition must actually be imported, validated, rendered and published.
- Source/license verification happens before each item enters ingestion.

## Item 1 — Hungarian Rhapsody No. 2

The first witness is the Bernd Krueger MIDI hosted by Wikimedia Commons, sourced from piano-midi.de. Commons identifies the file as **CC BY-SA 3.0 Germany**. The Liszt composition itself is public domain. IMSLP separately exposes multiple complete public-domain score editions, giving the MIDI an independent score-reference path.

The licensed-MIDI pipeline will vendor the approved remote file under `data/sources/`, validate and parse Standard MIDI File timing, preserve source track/channel identity, emit a complete Full Rendition artifact under `data/ingested/`, and record the file hash in provenance.
