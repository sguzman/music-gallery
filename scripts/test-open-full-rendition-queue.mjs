#!/usr/bin/env node
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,"..");
const queue=JSON.parse(readFileSync(resolve(ROOT,"data/intake/open-full-rendition-queue.json"),"utf8"));
assert.equal(queue.governance.status,"locked-by-user");
assert.equal(queue.queue.length,10);
assert.deepEqual(queue.queue.map(x=>x.order),[1,2,3,4,5,6,7,8,9,10]);
for(const item of queue.queue){
  assert.equal(item.status,"published-awaiting-user-qa",`${item.slug} must be published before the locked queue is considered processed`);
  const songPath=resolve(ROOT,`data/songs/${item.slug}.json`);
  assert.ok(existsSync(songPath),`${item.slug}: public song JSON missing`);
  const song=JSON.parse(readFileSync(songPath,"utf8"));
  assert.equal(song.fullVersion?.status,"available",`${item.slug}: Full Rendition must be available`);
  assert.ok(song.fullVersion?.artifactPath,`${item.slug}: external Full Rendition artifact path missing`);
  const artifactPath=resolve(ROOT,song.fullVersion.artifactPath);
  assert.ok(existsSync(artifactPath),`${item.slug}: Full Rendition artifact missing`);
  const full=JSON.parse(readFileSync(artifactPath,"utf8"));
  assert.equal(full.status,"available");
  assert.ok(Array.isArray(full.tracks)&&full.tracks.length>0,`${item.slug}: no Full Rendition tracks`);
  assert.ok(full.tracks.reduce((n,t)=>n+(t.events?.length||0),0)>0,`${item.slug}: empty Full Rendition graph`);
}
console.log("open Full Rendition queue contract self-test: PASS");
