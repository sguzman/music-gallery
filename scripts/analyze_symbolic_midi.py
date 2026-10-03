#!/usr/bin/env python3
"""Produce a non-note-by-note structural profile of a Standard MIDI File.

This is intentionally an analysis layer, not a republication layer: output
contains timing/program/range/count metadata but not the complete copyrighted
event graph.
"""
from __future__ import annotations
import argparse, hashlib, json, statistics, struct
from pathlib import Path

def read_vlq(buf: bytes, pos: int):
    value=0
    while True:
        if pos>=len(buf): raise ValueError("truncated VLQ")
        b=buf[pos]; pos+=1
        value=(value<<7)|(b&0x7f)
        if not b&0x80: return value,pos

def parse_track(buf: bytes, index: int, division: int):
    p=tick=0; running=None; active={}; notes=[]; programs=[]; names=[]; tempos=[]; timesigs=[]; channels=set()
    while p < len(buf):
        delta,p=read_vlq(buf,p); tick+=delta
        if p>=len(buf): break
        status=buf[p]
        if status < 0x80:
            if running is None: raise ValueError("running status without prior channel status")
            status=running
        else:
            p+=1
            if status < 0xF0: running=status
        if status==0xFF:
            if p>=len(buf): break
            meta=buf[p]; p+=1
            ln,p=read_vlq(buf,p); payload=buf[p:p+ln]; p+=ln
            if meta==0x03: names.append(payload.decode("latin1","replace"))
            elif meta==0x51 and ln==3:
                us=int.from_bytes(payload,"big")
                if us: tempos.append({"tick":tick,"unit":round(tick/division,9),"bpm":round(60000000/us,6)})
            elif meta==0x58 and ln>=2:
                timesigs.append({"tick":tick,"unit":round(tick/division,9),"meter":f"{payload[0]}/{2**payload[1]}"})
            continue
        if status in (0xF0,0xF7):
            ln,p=read_vlq(buf,p); p+=ln; running=None; continue
        kind=status&0xF0; ch=status&0x0F; channels.add(ch)
        need=1 if kind in (0xC0,0xD0) else 2
        vals=list(buf[p:p+need]); p+=need
        if len(vals)!=need: raise ValueError("truncated MIDI event")
        if kind==0xC0:
            programs.append({"tick":tick,"unit":round(tick/division,9),"channel":ch,"program":vals[0]})
        elif kind==0x90:
            key,vel=vals
            if vel:
                active.setdefault((ch,key),[]).append((tick,vel))
            else:
                stack=active.get((ch,key))
                if stack:
                    st,sv=stack.pop(0); notes.append((st,tick,key,sv,ch))
        elif kind==0x80:
            key,_=vals
            stack=active.get((ch,key))
            if stack:
                st,sv=stack.pop(0); notes.append((st,tick,key,sv,ch))
    pitches=[n[2] for n in notes]; starts=[n[0] for n in notes]; ends=[n[1] for n in notes]
    durations=[(n[1]-n[0])/division for n in notes]
    return {
        "trackIndex":index,
        "name":" | ".join(names) if names else None,
        "noteCount":len(notes),
        "channels":sorted(channels),
        "programTimeline":programs,
        "minMidi":min(pitches) if pitches else None,
        "maxMidi":max(pitches) if pitches else None,
        "firstUnit":round(min(starts)/division,9) if starts else None,
        "lastUnit":round(max(ends)/division,9) if ends else None,
        "medianDurationUnits":round(statistics.median(durations),9) if durations else None,
        "tempoEvents":tempos,
        "timeSignatureEvents":timesigs,
    }, notes

def analyze(path: Path, source_url: str|None=None, source_page: str|None=None):
    data=path.read_bytes()
    if data[:4]!=b"MThd": raise ValueError("not an SMF MIDI")
    hlen=struct.unpack(">I",data[4:8])[0]
    fmt,ntrks,division=struct.unpack(">HHH",data[8:14])
    if division&0x8000: raise ValueError("SMPTE time division is not supported")
    pos=8+hlen; tracks=[]; max_tick=0; tempos=[]; timesigs=[]
    for ti in range(ntrks):
        if data[pos:pos+4]!=b"MTrk": raise ValueError(f"missing MTrk at byte {pos}")
        ln=struct.unpack(">I",data[pos+4:pos+8])[0]
        buf=data[pos+8:pos+8+ln]; pos+=8+ln
        profile,notes=parse_track(buf,ti,division)
        tracks.append(profile)
        if notes: max_tick=max(max_tick,max(n[1] for n in notes))
        tempos.extend(profile["tempoEvents"]); timesigs.extend(profile["timeSignatureEvents"])
    def unique(items, keys):
        out=[]; seen=set()
        for x in sorted(items,key=lambda a:tuple(a[k] for k in keys)):
            key=tuple(x[k] for k in keys)
            if key not in seen: seen.add(key); out.append(x)
        return out
    return {
        "schemaVersion":"1.0.0",
        "analysisKind":"structural-midi-profile",
        "source":{
            "path":str(path),
            "url":source_url,
            "page":source_page,
            "sha256":hashlib.sha256(data).hexdigest(),
            "bytes":len(data),
        },
        "midi":{
            "format":fmt,
            "trackCount":ntrks,
            "ticksPerQuarter":division,
            "durationUnits":round(max_tick/division,9),
            "tempoMap":unique(tempos,("tick","bpm")),
            "timeSignatureMap":unique(timesigs,("tick","meter")),
        },
        "tracks":tracks,
        "policyNote":"Structural profile only: complete note-by-note event data is intentionally omitted."
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input",type=Path)
    ap.add_argument("--output",type=Path,required=True)
    ap.add_argument("--source-url")
    ap.add_argument("--source-page")
    args=ap.parse_args()
    result=analyze(args.input,args.source_url,args.source_page)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n")
    print(f"{args.output}: {result['midi']['trackCount']} tracks, {sum(t['noteCount'] for t in result['tracks'])} notes profiled, {result['midi']['durationUnits']} quarter units")

if __name__=="__main__":
    main()
