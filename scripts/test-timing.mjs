#!/usr/bin/env node
import assert from "node:assert/strict";
import {secondsPerUnit,midiMicrosPerQuarter,unitsToTicks,transportTempoBounds} from "../assets/js/timing.js";

const eps=1e-12;
assert.ok(Math.abs(secondsPerUnit(120,1)-0.5)<eps);
assert.ok(Math.abs(secondsPerUnit(120,2)-0.25)<eps);
assert.ok(Math.abs(secondsPerUnit(66,2)-(60/132))<eps);
assert.equal(midiMicrosPerQuarter(120),500000);
assert.equal(midiMicrosPerQuarter(66),909091);
assert.equal(unitsToTicks(2,2,480),480);
assert.equal(unitsToTicks(12,2,480),2880);
assert.deepEqual(transportTempoBounds([40,90],66),{min:20,max:320});
assert.ok(transportTempoBounds([55,120],92).max>=320);
console.log("timing self-test: PASS");
