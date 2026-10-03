#!/usr/bin/env node
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,"..");
const queuePath=resolve(ROOT,"data/intake/mozart-requiem-k626-queue.json");
const queue=JSON.parse(readFileSync(queuePath,"utf8"));

assert.equal(queue.governance.status,"locked-by-user");
assert.equal(queue.work.catalogue,"K.626");
assert.equal(queue.queue.length,14);
assert.deepEqual(queue.queue.map(x=>x.order),Array.from({length:14},(_,i)=>i+1));

const expected=[
  "mozart-requiem-introitus",
  "mozart-requiem-kyrie",
  "mozart-dies-irae",
  "mozart-requiem-tuba-mirum",
  "mozart-requiem-rex-tremendae",
  "mozart-requiem-recordare",
  "mozart-requiem-confutatis",
  "mozart-requiem-lacrimosa",
  "mozart-requiem-domine-jesu",
  "mozart-requiem-hostias",
  "mozart-requiem-sanctus",
  "mozart-requiem-benedictus",
  "mozart-requiem-agnus-dei",
  "mozart-requiem-lux-aeterna"
];
assert.deepEqual(queue.queue.map(x=>x.slug),expected);

assert.equal(queue.processingCursor,1);
assert.equal(queue.queue[0].status,"source-verification-in-progress");

const intake=JSON.parse(readFileSync(resolve(ROOT,"data/intake/mozart-requiem-introitus.json"),"utf8"));
assert.equal(intake.approval.status,"user-approved");
assert.equal(intake.ingest.enabled,false);
assert.equal(intake.ingest.status,"source-verification");
assert.ok(Array.isArray(intake.sourceCandidates)&&intake.sourceCandidates.length>0);

const dies=queue.queue[2];
assert.equal(dies.slug,"mozart-dies-irae");
assert.equal(dies.status,"published-awaiting-user-qa");
const songPath=resolve(ROOT,"data/songs/mozart-dies-irae.json");
assert.ok(existsSync(songPath),"existing Dies irae public song JSON missing");
const song=JSON.parse(readFileSync(songPath,"utf8"));
assert.equal(song.fullVersion?.status,"available");
assert.ok(song.fullVersion?.artifactPath);
assert.ok(existsSync(resolve(ROOT,song.fullVersion.artifactPath)),"existing Dies irae Full Rendition artifact missing");

for(const item of queue.queue){
  if(item.order===1 || item.order===3) continue;
  assert.equal(item.status,"queued",`${item.order} ${item.slug}: unexpected initial state`);
}

console.log("Mozart Requiem K.626 queue contract self-test: PASS");
