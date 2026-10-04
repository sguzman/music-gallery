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
| 13 | Agnus Dei | published — awaiting QA | 51 measures · 17 tracks · 2,238 events · CC0 source measures 1–51 |
| 14 | Lux aeterna / Communio | published — awaiting QA | 82 measures · 17 tracks · 8,482 events · CC0 source measures 52–133 |

Machine-readable queue: `data/intake/mozart-requiem-k626-queue.json`.

## Corpus contract

A movement is complete only when it has a redistribution-clean symbolic witness, a normalized nonempty event graph, public song JSON with `fullVersion.status === "available"`, and the actual Full Rendition artifact. Piano, choir/piano, or choir/organ reductions do **not** satisfy the contract when the target work is orchestral.

Processing was strict-order throughout the queue. That constraint is now satisfied: all fourteen movements are published as independently playable Full Renditions.

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

## Agnus Dei source-quality repair

The first Agnus witness, ScoreBase/PDMX **155734**, was correctly rejected because it produced only **6 note-bearing tracks / 1,324 events** (SATB + organ reduction).

The blocker was resolved with the exact `K626 Requiem 12 agnus dei.mid` file in the **dominicfanucchi/aai-511_group1** classical-MIDI dataset mirror. That repository explicitly licenses its dataset under **CC0 1.0**. The witness is a combined Requiem tail: its structure resolves as **51 measures of 3/4 Agnus Dei** followed immediately by **82 measures of 4/4 Communio**.

Musicarium therefore uses the same clean source in two non-overlapping slices:

- **Agnus Dei:** source measures 1–51 — 153 quarter units — **17 tracks / 2,238 events**.
- **Lux aeterna / Communio:** source measures 52–133 — approximately 328 quarter units — **17 tracks / 8,482 events**.

Both artifacts retain the full traditional orchestral/SATB track inventory, with normalized display labels and mix metadata. The rejected six-track Agnus reduction remains documented as a negative source-quality witness.

## Queue completion

The Mozart Requiem K.626 corpus is **complete**. All fourteen movements now satisfy the Musicarium Full Rendition contract: a redistribution-clean symbolic witness, normalized nonempty event graph, published public song JSON with an available Full Rendition, and a real retained artifact.

The final queue state remains `published-awaiting-user-qa` for each movement so optional listening and UX QA can still record concrete defects without reopening source acquisition.
