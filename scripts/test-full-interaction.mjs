#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const js=readFileSync(new URL("../assets/js/song-page.js",import.meta.url),"utf8");
const catalogJs=readFileSync(new URL("../assets/js/catalog.js",import.meta.url),"utf8");
const buildPy=readFileSync(new URL("../scripts/build.py",import.meta.url),"utf8");
const indexHtml=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const schubert=JSON.parse(readFileSync(new URL("../data/songs/schubert-serenade.json",import.meta.url),"utf8"));

assert.ok(js.includes('trackBuses=new Map()'),"full renderer must have per-track live audio buses");
assert.ok(js.includes('function setTrackGain(track,enabled)'),"live mixer gain path must exist");
assert.ok(!js.includes('bus.gain.gain'),"live mixer must address the GainNode AudioParam correctly");
assert.ok(!js.includes('if(!trackEnabled(track))return'),"muted tracks must remain in the full event graph");
assert.ok(js.includes('function schedulerStep'),"playback must use rolling scheduling");
assert.ok(js.includes('SCHEDULER_LOOKAHEAD_SEC=.9'),"rolling scheduler must keep enough lookahead to avoid late note scheduling");
assert.ok(js.includes('SCHEDULER_INTERVAL_MS=40'),"rolling scheduler cadence must be tight enough for stable playback");
assert.ok(js.includes('function audibleContextTime()'),"visual transport must estimate the audio that is actually reaching the output");
assert.ok(js.includes('audio.getOutputTimestamp()'),"visual transport should use the browser output timestamp when available");
assert.ok(js.includes('function schedulerTransportUnit()'),"audio scheduling must stay on the graph clock instead of the delayed audible clock");
assert.ok(js.includes('AUDIO_START_LEAD=.12'),"playback must reserve a stable scheduling lead before the first audible onset");
assert.ok(js.includes('function sourceTempoMap()'),"full renditions must expose source tempo-map timing when available");
assert.ok(js.includes('function pianoRegisterGain(midi)'),"piano synth must compensate low-register perceptual loudness");
assert.ok(js.includes('function orchestralRegisterGain(midi'),"orchestral synths must compensate low-register perceptual loudness");
assert.ok(js.includes('function fluteTone('),"full renditions must have a dedicated flute timbre");
assert.ok(js.includes('function oboeTone('),"full renditions must have a dedicated oboe/English-horn timbre");
assert.ok(js.includes('function clarinetTone('),"full renditions must have a dedicated clarinet timbre");
assert.ok(js.includes('function bassoonTone('),"full renditions must have a dedicated bassoon timbre");
assert.ok(js.includes('function hornTone('),"full renditions must have a dedicated horn timbre");
assert.ok(js.includes('if(m<=36)return 2'),"deep piano bass must receive explicit low-register gain compensation");
assert.ok(js.includes('.30+.28*low'),"low piano notes must gain upper harmonics so they remain audible on limited speakers");
assert.ok(js.includes('function transportSecondsAtUnit(unit)'),"full transport must integrate tempo-map segments");
assert.ok(js.includes('function transportUnitAtSeconds(seconds)'),"full transport must invert tempo-map timing for the playhead");
assert.ok(js.includes('tempoTimeline=(map.length?map:'),"full MIDI export must preserve source tempo maps");
assert.ok(js.includes('requestAnimationFrame(()=>visualStep'),"cursor/playhead must render from the audio clock");
assert.ok(js.includes('check.onchange=()=>setTrackEnabledLive(track,ti,check.checked)'),"track toggles must use live mixer path");
assert.ok(js.includes('setAllTracksLive(true)')&&js.includes('setAllTracksLive(false)'),"all-on/all-off must be live");
assert.ok(js.includes('seekFullToUnits((x/rect.width)*total)'),"staff click must seek");
assert.ok(js.includes('note.onclick=ev=>{ev.stopPropagation();seekFullToUnits(e.start);'),"note click must seek");
assert.ok(js.includes('gate=viewMode==="full"?1:'),"full score playback must use notated note length rather than practice gate");
assert.ok(js.includes('function voiceTone'),"vocal source parts must not be rendered with the violin oscillator path");
assert.ok(js.includes('const voiceBody=audio.createBiquadFilter()'),"vocal synth must include a broadband body path instead of relying only on narrow formant filters");
assert.ok(js.includes('score-playhead'),"full score must expose a visible playhead");
assert.ok(js.includes('full.disabled=false'),"non-ingested full-rendition states must remain inspectable rather than disabled");
assert.ok(js.includes('function renderFullPending'),"non-ingested full-rendition states need an explicit evidence/status surface");
assert.ok(js.includes('const env=envelope(start,seconds,.14*level,.02,.36,destination)'),"voice synth must use normalized output gain rather than overpowering accompaniment");
assert.equal(schubert.fullVersion.tracks.find(t=>t.id==="voice").level,1.05,"Schubert voice mix must not retain the old 1.55 overboost");

assert.ok(buildPy.includes('"hasFullRendition":song.get("fullVersion",{}).get("status")=="available"'),"catalog summaries must expose Full Rendition availability");
assert.ok(catalogJs.includes('fullOnly:true'),"main catalog must default to the Full Rendition showcase");
assert.ok(catalogJs.includes('if(state.fullOnly && !song.hasFullRendition) return false;'),"Practice-only/incomplete songs must be filtered by default");
assert.ok(indexHtml.includes('id="fullOnly" type="checkbox" checked'),"main page must provide an obvious checked Full Rendition-only toggle");
assert.ok(indexHtml.includes('Show all / clear'),"main page must provide an easy escape from the default showcase filter");

console.log("full interaction contract self-test: PASS");
