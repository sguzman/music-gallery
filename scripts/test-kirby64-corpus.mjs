#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const queue=JSON.parse(readFileSync(new URL("../data/intake/kirby64-corpus.json",import.meta.url),"utf8"));
assert.equal(queue.governance.status,"locked-by-user");
assert.deepEqual(queue.queue.map(x=>x.order),[1,2,3,4,5,6,7,8,9,10]);
assert.deepEqual(queue.queue.map(x=>x.title),[
  "0² / Zero-Two","Factory Inspection","Miracle Matter","Ripple Star","Pop Star",
  "Aqua Star","Boss","Shiver Star","Neo Star","Dark Star / Heading for 0²"
]);
assert.equal(queue.queue[0].status,"practice-candidate-extracted");
assert.ok(queue.queue.slice(1).every(x=>x.status==="queued"));

const a=JSON.parse(readFileSync(new URL("../data/ingested/kirby64-zero-two.midi-analysis.json",import.meta.url),"utf8"));
assert.equal(a.midi.format,1);
assert.equal(a.midi.trackCount,14);
assert.equal(a.midi.ticksPerQuarter,96);
assert.equal(a.midi.tempoMap[0].bpm,170.000085);
assert.equal(a.tracks[5].noteCount,205);
assert.deepEqual([a.tracks[5].minMidi,a.tracks[5].maxMidi],[59,101]);

const c=JSON.parse(readFileSync(new URL("../data/ingested/kirby64-zero-two.practice-candidate.json",import.meta.url),"utf8"));
assert.equal(c.source.trackIndex,5);
assert.deepEqual(c.source.sourceWindowQuarterUnits,[116,147.9375]);
assert.equal(c.events.length,17);
assert.deepEqual(c.events.slice(0,5).map(x=>x.sourceMidi),[69,79,76,72,74]);
assert.ok(c.events.every(x=>Number.isInteger(x.octaveFoldSemitones/12)));
assert.ok(c.events.every(x=>x.fret>=0&&x.fret<=10));
assert.equal(Math.max(...c.events.map(x=>x.fret)),10);
console.log("Kirby 64 corpus queue/candidate self-test: PASS");
