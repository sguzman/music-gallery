#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const js=readFileSync(new URL("../assets/js/song-page.js",import.meta.url),"utf8");

assert.ok(js.includes('trackBuses=new Map()'),"full renderer must have per-track live audio buses");
assert.ok(!js.includes('if(!trackEnabled(track))return'),"muted tracks must still be scheduled so they can be unmuted live");
assert.ok(js.includes('check.onchange=()=>setTrackEnabledLive(track,ti,check.checked)'),"track toggles must use live mixer path");
assert.ok(js.includes('setAllTracksLive(true)')&&js.includes('setAllTracksLive(false)'),"all-on/all-off must be live");
assert.ok(js.includes('seekFullToUnits((x/rect.width)*total)'),"staff click must seek");
assert.ok(js.includes('note.onclick=ev=>{ev.stopPropagation();seekFullToUnits(e.start);'),"note click must seek");
assert.ok(js.includes('gate=viewMode==="full"?1:'),"full score playback must use notated note length rather than practice gate");
assert.ok(js.includes('release=.18'),"synth envelope must include a release tail");
assert.ok(js.includes('score-playhead'),"full score must expose a visible playhead");

console.log("full interaction contract self-test: PASS");
