#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const canon=JSON.parse(readFileSync(new URL("../data/songs/canon-in-d.json",import.meta.url),"utf8"));
assert.equal(canon.fullVersion.status,"available");
assert.equal(canon.fullVersion.musical.meter,"4/4");
assert.equal(canon.fullVersion.durationUnits,228);
assert.equal(canon.fullVersion.measures.length,57);
assert.equal(canon.fullVersion.tracks.length,4);
const expected={violin1:593,violin2:577,violin3:561,cello:225};
for(const track of canon.fullVersion.tracks){
  assert.equal(track.events.length,expected[track.id]);
  assert.ok(track.events.every(e=>e.type==="note"&&e.start>=0&&e.duration>0&&e.start+e.duration<=228&&e.midi>=0&&e.midi<=127));
}
assert.deepEqual(canon.fullVersion.tracks.map(t=>t.name),["Violin I","Violin II","Violin III","Violoncello"]);
assert.equal(canon.fullVersion.provenance.sourceRepositoryCommit,"2144afd6f52d56c5b6995b8b589ef1268b3139f0");
console.log("full-version self-test: PASS");
