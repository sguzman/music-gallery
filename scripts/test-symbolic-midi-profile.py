#!/usr/bin/env python3
import importlib.util, struct, tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("midi_profile",root/"scripts/analyze_symbolic_midi.py")
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

def vlq(n):
    out=[n&0x7f]; n>>=7
    while n: out.append(0x80|(n&0x7f)); n>>=7
    return bytes(reversed(out))

track=b"".join([
    vlq(0)+b"\xff\x03\x04Test",
    vlq(0)+b"\xff\x51\x03"+(500000).to_bytes(3,"big"),
    vlq(0)+bytes([0xC0,40]),
    vlq(0)+bytes([0x90,60,100]),
    vlq(96)+bytes([0x80,60,0]),
    vlq(0)+bytes([0x90,64,90]),
    vlq(48)+bytes([0x80,64,0]),
    vlq(0)+b"\xff\x2f\x00",
])
smf=b"MThd"+struct.pack(">IHHH",6,1,1,96)+b"MTrk"+struct.pack(">I",len(track))+track
with tempfile.TemporaryDirectory() as td:
    p=Path(td)/"x.mid"; p.write_bytes(smf)
    j=mod.analyze(p,"https://example.test/x.mid","https://example.test")
    assert j["midi"]["format"]==1
    assert j["midi"]["trackCount"]==1
    assert j["midi"]["ticksPerQuarter"]==96
    assert j["midi"]["durationUnits"]==1.5
    assert j["midi"]["tempoMap"]==[{"tick":0,"unit":0.0,"bpm":120.0}]
    t=j["tracks"][0]
    assert t["name"]=="Test" and t["noteCount"]==2
    assert t["minMidi"]==60 and t["maxMidi"]==64
    assert t["programTimeline"][0]["program"]==40
print("symbolic MIDI structural-profile self-test: PASS")
