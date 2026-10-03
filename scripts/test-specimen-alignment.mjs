#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const load=(slug)=>JSON.parse(readFileSync(new URL(`../data/songs/${slug}.json`,import.meta.url),"utf8"));
const notes=(song)=>song.sections.flatMap(s=>s.measures).flatMap(m=>m.events).filter(e=>e.type==="note");

const astral=load("astral-observatory");
assert.equal(astral.musical.meter,"4/4");
assert.equal(astral.musical.defaultBpm,92);
assert.equal(astral.verification.timing.confidence,"low");

const canon=load("canon-in-d");
assert.equal(canon.musical.defaultBpm,72);
assert.equal(canon.stats.durationUnits,24);
assert.equal(canon.verification.timing.confidence,"high");

const chopin=load("chopin-nocturne");
assert.equal(chopin.musical.unitsPerQuarter,2);
assert.equal(chopin.musical.defaultBpm,66);
const chopinM1=chopin.sections.find(s=>s.id==="opening").measures.find(m=>m.label==="1");
assert.equal(chopinM1.events[0].duration,4);
assert.notEqual(chopinM1.events[0].midi,undefined);
const chopinM4=chopin.sections.find(s=>s.id==="climb").measures.find(m=>m.label==="4");
assert.deepEqual(chopinM4.events.filter(e=>e.type==="rest").map(e=>[e.start,e.duration]),[[9,2]]);
assert.equal(chopinM4.events.at(-1).start,11);

const genshin=load("genshin-main-theme");
assert.equal(genshin.musical.meter,"3/4");
assert.equal(genshin.musical.defaultBpm,80);
let checked=0;
for(const section of genshin.sections)for(const measure of section.measures){
  if(measure.source?.durationMs==null) continue;
  const reconstructed=measure.duration/genshin.musical.unitsPerQuarter*60/genshin.musical.defaultBpm;
  assert.ok(Math.abs(reconstructed-measure.source.durationMs/1000)<1e-6);
  checked++;
}
assert.equal(checked,13);
assert.notEqual(genshin.verification.timing.confidence,"high");

const schubert=load("schubert-serenade");
assert.equal(schubert.stats.measuresOrPracticeGroups,8);
assert.equal(schubert.verification.timing.confidence,"high");
const schubertEnd=schubert.sections.at(-1).measures.at(-1);
assert.deepEqual(schubertEnd.events.map(e=>[e.type,e.start,e.duration]),[["note",0,2],["rest",2,1]]);

const sugar=load("sugar-plum-fairy");
assert.equal(sugar.musical.defaultBpm,62);
assert.equal(sugar.origin.originalKey,"E minor");
const sugarPc=notes(sugar).map(e=>e.midi%12);
assert.deepEqual(sugarPc.slice(0,6),[7,4,7,6,3,4]);
assert.equal(sugarPc[30],2);
assert.deepEqual(sugarPc.slice(31,37),[7,4,7,6,3,4]);

const shostakovich=load("shostakovich-waltz-no2");
assert.equal(shostakovich.musical.meter,"3/4");
assert.equal(shostakovich.origin.originalKey,"C minor");
assert.equal(shostakovich.stats.measuresOrPracticeGroups,16);
assert.equal(shostakovich.stats.notes,28);
assert.equal(shostakovich.stats.maxFret,5);
assert.equal(shostakovich.fullVersion.status,"publication-rights-review");
const shostNotes=notes(shostakovich);
assert.deepEqual(shostNotes.slice(0,8).map(e=>e.midi),[67,64,62,60,60,60,62,64]);
assert.deepEqual(shostNotes.slice(-5).map(e=>e.midi),[65,67,69,66,67]);

console.log("specimen source-alignment self-test: PASS");
