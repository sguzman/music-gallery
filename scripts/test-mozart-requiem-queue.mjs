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

assert.ok(Number.isInteger(queue.processingCursor));
assert.ok(queue.processingCursor>=1 && queue.processingCursor<=14);

const allowedStatuses=new Set([
  "queued",
  "source-verification-in-progress",
  "ingestion-in-progress",
  "normalization-in-progress",
  "normalization-and-publication",
  "publication-in-progress",
  "source-quality-blocked",
  "preflight-source-identified",
  "published-awaiting-user-qa"
]);
for(const item of queue.queue){
  assert.ok(allowedStatuses.has(item.status),`${item.order} ${item.slug}: invalid status ${item.status}`);
}

const dies=queue.queue[2];
assert.equal(dies.slug,"mozart-dies-irae");
assert.equal(dies.status,"published-awaiting-user-qa");

for(const item of queue.queue){
  if(item.status!=="published-awaiting-user-qa") continue;
  const songPath=resolve(ROOT,"data/songs",`${item.slug}.json`);
  assert.ok(existsSync(songPath),`${item.slug}: published item missing public song JSON`);
  const song=JSON.parse(readFileSync(songPath,"utf8"));
  assert.equal(song.fullVersion?.status,"available",`${item.slug}: published item Full Rendition unavailable`);
  assert.ok(song.fullVersion?.artifactPath,`${item.slug}: published item missing artifactPath`);
  assert.ok(existsSync(resolve(ROOT,song.fullVersion.artifactPath)),`${item.slug}: published item artifact missing`);
}

for(const item of queue.queue){
  if(!["source-quality-blocked","preflight-source-identified"].includes(item.status)) continue;
  const intakePath=resolve(ROOT,"data/intake",`${item.slug}.json`);
  assert.ok(existsSync(intakePath),`${item.slug}: gated item missing intake manifest`);
  const intake=JSON.parse(readFileSync(intakePath,"utf8"));
  assert.equal(intake.ingest?.enabled,false,`${item.slug}: gated item must have ingest.enabled=false`);
}

const introitus=JSON.parse(readFileSync(resolve(ROOT,"data/intake/mozart-requiem-introitus.json"),"utf8"));
assert.equal(introitus.approval.status,"user-approved");
assert.ok(introitus.sourceCandidates?.length>0 || introitus.source?.sourcePage);

console.log("Mozart Requiem K.626 queue contract self-test: PASS");
