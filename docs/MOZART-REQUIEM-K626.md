# Mozart — Requiem in D minor, K.626

Musicarium tracks the traditional **Süssmayr completion** as one parent work with fourteen ordered, independently playable Full Renditions.

## Locked movement order

| # | Movement | Status | Full Rendition facts |
|---:|---|---|---|
| 1 | Introitus — Requiem aeternam | published — awaiting QA | 48 measures · 22 tracks · 3,965 events |
| 2 | Kyrie | published — awaiting QA | 52 measures · 16 tracks · 6,461 events |
| 3 | Dies irae | published — awaiting QA | 12 tracks · 3,921 events |
| 4 | Tuba mirum | published — awaiting QA | corrected q680–q932 · 63 source measures · 16 tracks · 1,525 events |
| 5 | Rex tremendae | published — awaiting QA | corrected q932–q1020 · 22 measures · 21 tracks · 2,040 events |
| 6 | Recordare | published — awaiting QA | q1020–q1410 · 130 measures of 3/4 · 15 tracks · 4,052 events |
| 7 | Confutatis | published — awaiting QA | q1410–q1578 · 42 measures of 4/4 · 21 tracks · 2,827 events |
| 8 | Lacrimosa | published — awaiting QA | q1578–end · 30 measures of 12/8 · 21 tracks · 2,102 events |
| 9 | Domine Jesu | published — awaiting QA | 78 measures · 14 tracks · 7,230 events |
| 10 | Hostias | published — awaiting QA | 89 measures · 14 tracks · 5,356 events · 3/4 → 4/4 Quam olim |
| 11 | Sanctus | published — awaiting QA | 38 measures · 18 tracks · 2,253 events · 4/4 → 3/4 Hosanna |
| 12 | Benedictus | published — awaiting QA | 76 measures · 17 tracks · 5,489 events · 4/4 → 3/4 Hosanna |
| 13 | Agnus Dei | **source-quality blocked** | rejected reduction: 6 tracks / 1,324 events; target: 51 measures / 17 full-orchestral parts |
| 14 | Lux aeterna / Communio | preflight source identified | candidate PDMX 46608: 82 measures / 18 parts; disabled pending movement 13 |

Machine-readable queue: `data/intake/mozart-requiem-k626-queue.json`.

## Corpus contract

A movement is complete only when it has a redistribution-clean symbolic witness, a normalized nonempty event graph, public song JSON with `fullVersion.status === "available"`, and the actual Full Rendition artifact. Piano, choir/piano, or choir/organ reductions do **not** satisfy the contract when the target work is orchestral.

Processing is strict-order. Later sources may be preflighted, but movement 14 cannot enter ingestion while movement 13 is blocked.

## Source and rights policy

The Mozart/Süssmayr composition is public domain. Modern symbolic witnesses are still provenance-gated. PDMX sources must be from its `no_license_conflict` corpus; otherwise the source must carry an independently clean public-domain or explicit redistribution license.

## Sequence boundary repair

The original cumulative-measure estimate for part of the Sequence was corrected using the source MIDI's own meter/tempo boundaries:

- Tuba mirum: q680–q932.
- Rex tremendae: q932–q1020.
- Recordare: q1020–q1410 (3/4).
- Confutatis: q1410–q1578 (4/4).
- Lacrimosa: q1578–end (12/8).

The corrected artifacts are the published ones.

## Benedictus source-quality repair

The first Benedictus witness, ScoreBase/PDMX 148760, proved to be only SATB + two organ staves and was rejected. ScoreBase/PDMX **94634** resolved the blocker with the complete 76-measure, 17-track traditional Süssmayr orchestration. That full witness is now published.

## Active blocker — Agnus Dei

ScoreBase/PDMX **155734**, despite being named “Mozart Requiem - Agnus Dei,” produced only **6 note-bearing tracks and 1,324 events**. It is a vocal/organ reduction and has been removed from `data/ingested/`; it must not be published as a Full Rendition.

The verified target signature is the traditional Süssmayr Agnus Dei: **51 measures in 3/4** with **17 parts** — basset horns, bassoons, trumpets in D, timpani, three trombones, strings, SATB, cello, double bass and organ. ScoreTail exposes exactly that public-domain score (2,423 notes), while IMSLP and the Neue Mozart-Ausgabe provide clean engraved/scholarly orchestration references.

The remaining task is source acquisition, not musical identification: obtain a redistribution-clean machine-readable MusicXML/MIDI export of that 51-measure full score.

## Movement 14 preflight

ScoreBase/PDMX **46608** is already recorded as a disabled preflight candidate for Lux aeterna / Communio: D minor, 4/4, **82 measures, 18 parts**, with complete SATB/orchestral forces. Its manifest intentionally has `ingest.enabled: false` until Agnus Dei is complete.
