# Mozart — Requiem in D minor, K.626

This document tracks the complete **traditional Süssmayr completion** as a work-level Musicarium corpus.

The user explicitly approved the entire Requiem after the successful `Dies irae` Full Rendition and requested that every movement be queued and processed in score order.

## Locked movement order

| # | Movement | Musicarium slug | Status |
|---:|---|---|---|
| 1 | Introitus — Requiem aeternam | `mozart-requiem-introitus` | **published — awaiting QA** |
| 2 | Kyrie | `mozart-requiem-kyrie` | **published — awaiting QA** |
| 3 | Dies irae | `mozart-dies-irae` | **published — awaiting QA** |
| 4 | Tuba mirum | `mozart-requiem-tuba-mirum` | **corrected publication in progress** | **published — awaiting QA** |
| 5 | Rex tremendae | `mozart-requiem-rex-tremendae` | **corrected publication in progress** | **published — awaiting QA** |
| 6 | Recordare | `mozart-requiem-recordare` | **publication in progress** | **published — awaiting QA** |
| 7 | Confutatis | `mozart-requiem-confutatis` | queued | **published — awaiting QA** |
| 8 | Lacrimosa | `mozart-requiem-lacrimosa` | queued | **published — awaiting QA** |
| 9 | Domine Jesu | `mozart-requiem-domine-jesu` | **published — awaiting QA** |
| 10 | Hostias | `mozart-requiem-hostias` | **published — awaiting QA** |
| 11 | Sanctus | `mozart-requiem-sanctus` | **published — awaiting QA** |
| 12 | Benedictus | `mozart-requiem-benedictus` | **ingestion in progress** |
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

The rights gate is now cleared for this witness. ScoreBase's PDMX importer defaults to `subset: "no_license_conflict"`, and its import task likewise defaults to that subset. PDMX defines this subset as songs whose public-facing and internal copyright metadata agree on public-domain status. The witness is therefore enabled for ingestion, with PDMX attribution retained.

IMSLP remains the score/reference authority for the work and provides public-domain editions suitable for cross-checking:

- https://imslp.org/wiki/Requiem_K.626_(Mozart,_Wolfgang_Amadeus)

## Current processing state

Movement 1, **Introitus — Requiem aeternam**, is published and CI-validated: **48 measures, 22 source tracks, 3,965 note events**. Source-part display names/mix metadata are normalized and a five-measure soprano Practice derivative is paired with the untouched complete Full Rendition.

Movement 2, **Kyrie**, is published and CI-validated: **52 measures, 16 source tracks, 6,461 note events**. Its opening Basso fugue subject is retained as a four-measure Practice derivative without octave folding.

Movement 4, **Tuba mirum**, is published and CI-validated: **62 measures, 19 retained note-bearing tracks, 1,538 note events**. The solo-trombone opening and staggered Bass → Tenor → Alto → Soprano entries confirm the boundary; source alternate clarinet layers are preserved and labeled rather than silently deleted.

Movement 5, **Rex tremendae**, is published and CI-validated: source measures **231-252**, **22 measures**, **21 retained tracks**, **2,024 note events**.

Movement 6, **Recordare**, is now active. The same conflict-free opening-Requiem witness is sliced at **source measures 253-382**, the standard **130-measure** Recordare span.

Movement 3, **Dies irae**, remains the already-published baseline: 3,921 note events across 12 note-bearing choral/orchestral tracks.


## Boundary QA correction — Sequence source

A structural QA pass on the combined PDMX MIDI found that the first cumulative-measure estimate for Tuba mirum/Rex tremendae was offset. The source itself gives unambiguous movement markers:

- **Tuba mirum:** q680, tempo ≈78 → q932, tempo changes to ≈52. Importer measures **171–233**.
- **Rex tremendae:** q932 → q1020. Exactly **22 measures** of 4/4, importer measures **234–255**.
- **Recordare:** q1020 changes to **3/4** and tempo ≈88 → q1410 returns to 4/4. Exactly **130 measures**, importer measures **256–385**.
- **Confutatis:** q1410 → q1578, where the meter changes to **12/8**.
- **Lacrimosa:** q1578 → q1758, exactly **30 measures of 12/8**.

The earlier Tuba and Rex public wrappers are therefore temporarily de-published in the queue contract until their source slices are regenerated and their metadata/counts are revalidated. This is a source-boundary repair, not a change to the underlying witness or rights status.


### Corrected regeneration results

The repaired boundaries regenerated cleanly:

- **Tuba mirum:** q680–q932; 63 source measures; **16 tracks / 1,525 events**.
- **Rex tremendae:** q932–q1020; exactly 22 measures; **21 tracks / 2,040 events**.
- **Recordare:** q1020–q1410; exactly 130 measures of 3/4; **15 tracks / 4,052 events**.

The ingestion scripts now also honor `ingest.enabled: false`, so queued manifests can no longer be fetched/normalized prematurely merely because they contain an approved source URL.


## Sequence publication completion

The combined Sequence witness has now been segmented and published through **Lacrimosa** using source structural markers rather than cumulative-count guesses:

- Tuba mirum: q680–q932 — 63 source measures — 16 tracks / 1,525 events.
- Rex tremendae: q932–q1020 — 22 measures — 21 tracks / 2,040 events.
- Recordare: q1020–q1410 — 130 measures of 3/4 — 15 tracks / 4,052 events.
- Confutatis: q1410–q1578 — 42 measures of 4/4 — 21 tracks / 2,827 events.
- Lacrimosa: q1578–end — 30 measures of 12/8 — 21 tracks / 2,102 events.

The work cursor now advances to **Domine Jesu**.


## Offertorium — Domine Jesu

Movement 9 source identity is verified from the witness itself: **G minor, 4/4, 78 measures, 14 parts**, matching the complete Domine Jesu. Ingestion produced **14 tracks / 7,230 note events**. Part labels and mix are normalized without changing the event graph.


Movement 9, **Domine Jesu**, is published and CI-validated: **78 measures, 14 tracks, 7,230 events**.

Movement 10, **Hostias**, is now active from PDMX score 149074. The witness is **89 measures in 3/4**, matching the complete Hostias including the Quam olim reprise.


Hostias ingestion confirms the full movement structure: **89 measures**, 3/4 opening, a source meter change to 4/4 at q162 for the Quam olim reprise, and **14 tracks / 5,356 events**.


Movement 10, **Hostias**, is published and CI-validated: **89 measures, 14 tracks, 5,356 events**.

Movement 11, **Sanctus**, is active from a Süssmayr-attributed PDMX witness: **D major, 4/4, 38 measures, 18 full-orchestral parts**.


Sanctus ingestion confirms **38 measures, 18 tracks, 2,253 events**, with the expected **4/4 → 3/4** transition at q40 for Hosanna.
