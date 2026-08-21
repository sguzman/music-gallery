#!/usr/bin/env python3
import json
from pathlib import Path
import build

ROOT=Path(__file__).resolve().parents[1]
SONG=ROOT/"data/songs/canon-in-d.json"


def duration(part):
    return sum(float(m["duration"]) for s in part["sections"] for m in s["measures"])


def events(part):
    out=[]
    base=0.0
    for section in part["sections"]:
        for measure in section["measures"]:
            for event in measure["events"]:
                if event.get("type")=="note":
                    out.append((base+float(event["start"]),event))
            base+=float(measure["duration"])
    return out


song=json.loads(SONG.read_text(encoding="utf-8"))
song=build.apply_timing_audit(song)
song=build.apply_ensemble_spec(song)

parts={part["id"]:part for part in song["parts"]}
assert list(parts)==["practice-melody","violin-1","violin-2","violin-3","violoncello"], list(parts)
assert parts["practice-melody"]["playbackGroup"]=="practice"
assert parts["practice-melody"]["sourceDerived"] is False

source=[parts[x] for x in ("violin-1","violin-2","violin-3","violoncello")]
assert all(part["playbackGroup"]=="ensemble" for part in source)
assert all(part["sourceDerived"] is True for part in source)
assert all(abs(duration(part)-48.0)<1e-9 for part in source)

assert events(parts["violin-1"])[0][0]==8.0
assert events(parts["violin-2"])[0][0]==16.0
assert events(parts["violin-3"])[0][0]==24.0
assert events(parts["violoncello"])[0][0]==0.0
assert events(parts["violin-1"])[0][1]["midi"]==78  # F#5
assert [event["midi"] for _,event in events(parts["violoncello"])[:8]]==[50,45,47,42,43,38,43,45]
assert song["playbackGroups"]["ensemble"]["tempoBpm"]==55
assert song["verification"]["ensembleTiming"]["confidence"]=="high"
assert song["verification"]["timing"]["confidence"]!="high", "source ensemble must not silently upgrade practice timing confidence"

print("Canon ensemble self-test passed: 2/4/6-bar canon entries + cello ground, all 48 units.")
