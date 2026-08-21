#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path
import build

ROOT=Path(__file__).resolve().parents[1]
SONG=ROOT/"data/songs/sugar-plum-fairy.json"


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
assert list(parts)==["practice-melody","violin-1","violin-2","celesta"], list(parts)
assert parts["practice-melody"]["playbackGroup"]=="practice"
assert parts["practice-melody"]["sourceDerived"] is False

source=[parts[x] for x in ("violin-1","violin-2","celesta")]
assert all(part["playbackGroup"]=="ensemble" for part in source)
assert all(part["sourceDerived"] is True for part in source)
assert all(abs(duration(part)-12.0)<1e-9 for part in source)

v1=events(parts["violin-1"])
v2=events(parts["violin-2"])
cel=events(parts["celesta"])

# Pizzicato violins begin halfway through bar 1, preserving the opening rests.
assert v1[0][0]==0.5 and v1[0][1]["midi"]==64  # E4
assert v2[0][0]==0.5 and v2[0][1]["midi"]==59  # B3
assert v1[1][0]==1.5 and v1[1][1]["midi"]==66  # F#4
assert v2[1][0]==1.5 and v2[1][1]["midi"]==60  # C4

# The celesta is silent for four complete 2/4 bars, entering at beat 1.5 of bar 5.
assert cel[0][0]==8.5, cel[0]
first_chord=[event["midi"] for start,event in cel if start==8.5]
assert first_chord==[88,95,103], first_chord  # E6, B6, G7

# Explicit event mode must preserve real polyphony rather than serializing chord tones.
counts=Counter(start for start,_ in cel)
assert counts[8.5]==3
assert counts[9.5]==4
assert counts[10.0]==4
assert counts[11.0]==4
assert max(counts.values())==4

# It must also preserve sub-quarter durations used by the celesta figure.
assert any(abs(float(event["duration"])-0.125)<1e-9 for _,event in cel)
assert any(abs(float(event["duration"])-0.25)<1e-9 for _,event in cel)

assert song["playbackGroups"]["ensemble"]["tempoBpm"]==62
assert song["verification"]["ensembleTiming"]["confidence"]=="medium"
assert song["verification"]["timing"]["confidence"]=="medium", "source ensemble must not upgrade practice timing confidence"
assert "opening six bars only" in song["verification"]["ensembleTiming"]["scope"]

print("Sugar Plum ensemble self-test passed: rests + simultaneous celesta chords + 3 heterogeneous source parts over 6 bars.")
