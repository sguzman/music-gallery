#!/usr/bin/env python3
from pathlib import Path
from tempfile import TemporaryDirectory
import struct, sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import import_licensed_midi as imp

def vlq(n):
    data=[n&127]
    n >>= 7
    while n:
        data.insert(0,(n&127)|128)
        n >>= 7
    return bytes(data)

def chunk(events):
    return b"MTrk"+struct.pack(">I",len(events))+events

meta=vlq(0)+bytes([0xFF,0x51,3,0x07,0xA1,0x20])
meta+=vlq(0)+bytes([0xFF,0x58,4,3,2,24,8])
meta+=vlq(0)+bytes([0xFF,0x2F,0])
rh=vlq(0)+bytes([0xFF,0x03,2])+b"RH"+vlq(0)+bytes([0xC0,0])
rh+=vlq(0)+bytes([0x90,72,90])+vlq(480)+bytes([0x80,72,0])+vlq(0)+bytes([0xFF,0x2F,0])
lh=vlq(0)+bytes([0xFF,0x03,2])+b"LH"+vlq(0)+bytes([0xC1,0])
lh+=vlq(0)+bytes([0x91,48,80])+vlq(960)+bytes([0x81,48,0])+vlq(0)+bytes([0xFF,0x2F,0])
blob=b"MThd"+struct.pack(">IHHH",6,1,3,480)+chunk(meta)+chunk(rh)+chunk(lh)

with TemporaryDirectory() as td:
    path=Path(td)/"fixture.mid"
    path.write_bytes(blob)
    manifest={
        "slug":"fixture",
        "identity":{"title":"Fixture"},
        "approval":{"status":"user-approved"},
        "source":{"path":str(path),"provider":"fixture","license":"CC0"},
        "ingest":{"trackLevel":0.7,"meterFallback":"4/4"},
    }
    full=imp.normalize(path,manifest)
    assert full["status"]=="available"
    assert full["musical"]["defaultBpm"]==120
    assert full["musical"]["meter"]=="3/4"
    assert len(full["tracks"])==2
    assert [track["id"] for track in full["tracks"]]==["piano-rh","piano-lh"]
    assert [len(track["events"]) for track in full["tracks"]]==[1,1]
    assert full["tracks"][0]["events"][0]["duration"]==1
    assert full["tracks"][1]["events"][0]["duration"]==2
    assert full["stats"]["events"]==2
    assert full["provenance"]["ticksPerQuarter"]==480

    # Multi-movement source slicing: three 4/4 measures, select only measure 2.
    segmeta=vlq(0)+bytes([0xFF,0x51,3,0x07,0xA1,0x20])
    segmeta+=vlq(0)+bytes([0xFF,0x58,4,4,2,24,8])
    segmeta+=vlq(5760)+bytes([0xFF,0x2F,0])
    melody=vlq(0)+bytes([0xFF,0x03,6])+b"Melody"+vlq(0)+bytes([0xC0,40])
    melody+=vlq(0)+bytes([0x90,60,90])+vlq(480)+bytes([0x80,60,0])
    melody+=vlq(1440)+bytes([0x90,62,90])+vlq(480)+bytes([0x80,62,0])
    melody+=vlq(1440)+bytes([0x90,64,90])+vlq(1920)+bytes([0x80,64,0])
    melody+=vlq(0)+bytes([0xFF,0x2F,0])
    segblob=b"MThd"+struct.pack(">IHHH",6,1,2,480)+chunk(segmeta)+chunk(melody)
    segpath=Path(td)/"segment.mid"
    segpath.write_bytes(segblob)
    segmanifest={
        "slug":"segment-fixture",
        "identity":{"title":"Segment Fixture"},
        "approval":{"status":"user-approved"},
        "source":{"path":str(segpath),"provider":"fixture","license":"CC0"},
        "ingest":{"meterFallback":"4/4","segmentMeasures":{"start":2,"end":2}},
    }
    segmented=imp.normalize(segpath,segmanifest)
    assert segmented["durationUnits"]==4
    assert len(segmented["measures"])==1
    assert segmented["measures"][0]=={"label":"1","start":0.0,"duration":4.0}
    assert segmented["stats"]["events"]==1
    assert segmented["tracks"][0]["events"][0]["start"]==0
    assert segmented["tracks"][0]["events"][0]["midi"]==62
    assert segmented["provenance"]["segmentMeasures"]["startMeasure"]==2
    assert segmented["provenance"]["segmentMeasures"]["endMeasure"]==2
    assert segmented["provenance"]["segmentMeasures"]["sourceMeasureCount"]==3

print("licensed MIDI importer self-test: PASS")
