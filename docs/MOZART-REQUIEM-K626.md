# Mozart — Requiem in D minor, K.626

This document tracks the complete **traditional Süssmayr completion** as a work-level Musicarium corpus.

The user explicitly approved the entire Requiem after the successful `Dies irae` Full Rendition and requested that every movement be queued and processed in score order.

## Locked movement order

| # | Movement | Musicarium slug | Status |
|---:|---|---|---|
| 1 | Introitus — Requiem aeternam | `mozart-requiem-introitus` | **source verification in progress** |
| 2 | Kyrie | `mozart-requiem-kyrie` | queued |
| 3 | Dies irae | `mozart-dies-irae` | **published — awaiting QA** |
| 4 | Tuba mirum | `mozart-requiem-tuba-mirum` | queued |
| 5 | Rex tremendae | `mozart-requiem-rex-tremendae` | queued |
| 6 | Recordare | `mozart-requiem-recordare` | queued |
| 7 | Confutatis | `mozart-requiem-confutatis` | queued |
| 8 | Lacrimosa | `mozart-requiem-lacrimosa` | queued |
| 9 | Domine Jesu | `mozart-requiem-domine-jesu` | queued |
| 10 | Hostias | `mozart-requiem-hostias` | queued |
| 11 | Sanctus | `mozart-requiem-sanctus` | queued |
| 12 | Benedictus | `mozart-requiem-benedictus` | queued |
| 13 | Agnus Dei | `mozart-requiem-agnus-dei` | queued |
| 14 | Lux aeterna / Communio | `mozart-requiem-lux-aeterna` | queued |

Machine-readable queue: `data/intake/mozart-requiem-k626-queue.json`.

## Work model

The Requiem is represented simultaneously as:

- one work: Mozart/Süssmayr, Requiem in D minor, K.626;
- fourteen ordered, independently playable Musicarium movement specimens;
- one existing published movement, `Dies irae`, reused in-place rather than duplicated.

This preserves work-level identity without sacrificing the existing per-song Full Rendition model.

## Processing policy

Processing is strictly sequential. A later movement may have source candidates identified, but the active cursor does not advance until the current movement has a redistribution-clean symbolic source and a validated Full Rendition.

A movement is not complete merely because a PDF, MIDI, MusicXML, or recording exists. It must reach the same publication contract as the previous Full Rendition queue: public song JSON, `fullVersion.status === "available"`, real artifact, and a nonempty source-grounded event graph.

## Source and rights gate

The composition itself is safely public domain. The remaining risk is the **specific modern symbolic witness**.

For Introitus, source discovery has already started. ScoreBase exposes a PDMX-derived candidate with 48 measures, 22 parts, SATB, orchestra and pipe organ, which structurally matches the complete movement:

- https://scorebase.org/scores/178366

PDMX documents that a minority of its corpus has a discrepancy between public-facing and internal license metadata and explicitly recommends its `no_license_conflict` subset:

- https://github.com/pnlong/PDMX

Therefore the ScoreBase/PDMX candidate remains **candidate-only** until that exact row is verified as conflict-free. Musicarium will not silently weaken the rights gate just to make ingestion convenient.

IMSLP remains the score/reference authority for the work and provides public-domain editions suitable for cross-checking:

- https://imslp.org/wiki/Requiem_K.626_(Mozart,_Wolfgang_Amadeus)

## Current processing state

Movement 1, **Introitus — Requiem aeternam**, is now active. Its intake manifest is deliberately parked at `ingest.enabled: false` while source-license verification is completed. Once a clean symbolic witness is resolved, the normal source -> normalized artifact -> song JSON -> validation -> publication pipeline resumes.

Movement 3, **Dies irae**, remains the already-published baseline: 3,921 note events across 12 note-bearing choral/orchestral tracks.
