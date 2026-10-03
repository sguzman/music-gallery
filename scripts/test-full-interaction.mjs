#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const js=readFileSync(new URL("../assets/js/song-page.js",import.meta.url),"utf8");

assert.ok(js.includes('trackBuses=new Map()'),"full renderer must have per-track live audio buses");
assert.ok(js.includes('function setTrackGain(track,enabled)'),"live mixer gain path must exist");
assert.ok(!js.includes('bus.gain.gain'),"live mixer must address the GainNode AudioParam correctly");
assert.ok(!js.includes('if(!trackEnabled(track))return'),"muted tracks must remain in the full event graph");
assert.ok(js.includes('function schedulerStep'),"playback must use rolling scheduling");
assert.ok(js.includes('lookaheadSec=.48'),"rolling scheduler must use bounded lookahead");
assert.ok(js.includes('audio.currentTime-transportAudioStart'),"transport position must derive from AudioContext clock");
assert.ok(js.includes('requestAnimationFrame(()=>visualStep'),"cursor/playhead must render from the audio clock");
assert.ok(js.includes('check.onchange=()=>setTrackEnabledLive(track,ti,check.checked)'),"track toggles must use live mixer path");
assert.ok(js.includes('setAllTracksLive(true)')&&js.includes('setAllTracksLive(false)'),"all-on/all-off must be live");
assert.ok(js.includes('seekFullToUnits((x/rect.width)*total)'),"staff click must seek");
assert.ok(js.includes('note.onclick=ev=>{ev.stopPropagation();seekFullToUnits(e.start);'),"note click must seek");
assert.ok(js.includes('gate=viewMode==="full"?1:'),"full score playback must use notated note length rather than practice gate");
assert.ok(js.includes('function voiceTone'),"vocal source parts must not be rendered with the violin oscillator path");
assert.ok(js.includes('score-playhead'),"full score must expose a visible playhead");

console.log("full interaction contract self-test: PASS");
