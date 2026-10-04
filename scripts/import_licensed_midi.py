#!/usr/bin/env python3
"""Import approved, licensed Standard MIDI files into complete Musicarium Full Rendition artifacts."""
from __future__ import annotations
from collections import defaultdict
from pathlib import Path
import argparse, hashlib, json, re, statistics, struct

ROOT=Path(__file__).resolve().parents[1]
INTAKE=ROOT/"data"/"intake"
TOL=1e-9

def read_vlq(buf: bytes, pos: int):
    value=0
    while True:
        if pos>=len(buf):
            raise ValueError("truncated VLQ")
        b=buf[pos]
        pos+=1
        value=(value<<7)|(b&0x7f)
        if not b&0x80:
            return value,pos

def slugify(value):
    value=re.sub(r"[^a-z0-9]+","-",str(value or "").lower()).strip("-")
    return value or "track"

def program_instrument(program, channel):
    if channel==9:
        return "generic"
    p=0 if program is None else int(program)
    if 0<=p<=7: return "piano"
    if p==8: return "celesta"
    if 24<=p<=31: return "guitar"
    if 40<=p<=41: return "violin"
    if p==42: return "cello"
    if 43<=p<=51: return "strings"
    if 52<=p<=54: return "voice"
    if 56<=p<=63: return "horn"
    if p==68: return "oboe"
    if p==70: return "bassoon"
    if p==71: return "clarinet"
    if p==73: return "flute"
    return "piano"

def parse_track(buf, index, ppq):
    p=tick=0
    running=None
    active=defaultdict(list)
    notes=[]
    names=[]
    programs=[]
    tempos=[]
    timesigs=[]
    while p<len(buf):
        delta,p=read_vlq(buf,p)
        tick+=delta
        if p>=len(buf):
            break
        status=buf[p]
        if status<0x80:
            if running is None:
                raise ValueError(f"track {index}: running status without prior status")
            status=running
        else:
            p+=1
            if status<0xF0:
                running=status
        if status==0xFF:
            if p>=len(buf):
                break
            meta=buf[p]
            p+=1
            ln,p=read_vlq(buf,p)
            payload=buf[p:p+ln]
            p+=ln
            if meta==0x03:
                names.append(payload.decode("latin1","replace").strip())
            elif meta==0x51 and ln==3:
                us=int.from_bytes(payload,"big")
                if us:
                    tempos.append({"tick":tick,"start":round(tick/ppq,9),"bpm":round(60000000/us,6)})
            elif meta==0x58 and ln>=2:
                denominator=2**payload[1]
                timesigs.append({"tick":tick,"start":round(tick/ppq,9),"meter":f"{payload[0]}/{denominator}"})
            continue
        if status in (0xF0,0xF7):
            ln,p=read_vlq(buf,p)
            p+=ln
            running=None
            continue
        kind=status&0xF0
        channel=status&0x0F
        need=1 if kind in (0xC0,0xD0) else 2
        vals=list(buf[p:p+need])
        p+=need
        if len(vals)!=need:
            raise ValueError(f"track {index}: truncated channel event")
        if kind==0xC0:
            programs.append({"tick":tick,"start":round(tick/ppq,9),"channel":channel,"program":vals[0]})
        elif kind==0x90:
            key,vel=vals
            if vel:
                active[(channel,key)].append((tick,vel))
            else:
                stack=active.get((channel,key))
                if stack:
                    st,sv=stack.pop(0)
                    notes.append((st,tick,key,sv,channel))
        elif kind==0x80:
            key,_=vals
            stack=active.get((channel,key))
            if stack:
                st,sv=stack.pop(0)
                notes.append((st,tick,key,sv,channel))
    for (channel,key),stack in active.items():
        for st,sv in stack:
            if tick>st:
                notes.append((st,tick,key,sv,channel))
    return {
        "index":index,
        "name":" | ".join(x for x in names if x) or f"MIDI Track {index}",
        "notes":notes,
        "programs":programs,
        "tempos":tempos,
        "timesigs":timesigs,
    }

def uniq(items, keys):
    seen=set()
    out=[]
    for item in sorted(items,key=lambda x:tuple(x[k] for k in keys)):
        key=tuple(item[k] for k in keys)
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out

def measures_for(duration, meter_map, fallback):
    def parse_meter(value):
        try:
            n,d=value.split("/",1)
            return int(n),int(d)
        except Exception:
            return 4,4
    points=[{"start":0.0,"meter":fallback}]
    for item in meter_map:
        if item["start"]<=duration+TOL:
            if item["start"]==0:
                points[0]={"start":0.0,"meter":item["meter"]}
            else:
                points.append({"start":float(item["start"]),"meter":item["meter"]})
    points=uniq(points,("start","meter"))
    out=[]
    label=1
    for i,point in enumerate(points):
        pos=point["start"]
        end=points[i+1]["start"] if i+1<len(points) else duration
        numerator,denominator=parse_meter(point["meter"])
        span=numerator*4/denominator
        if span<=0:
            span=4
        while pos<end-TOL:
            actual=min(span,end-pos)
            out.append({"label":str(label),"start":round(pos,9),"duration":round(actual,9)})
            label+=1
            pos+=span
    if not out and duration>0:
        out=[{"label":"1","start":0.0,"duration":round(duration,9)}]
    return out

def normalize(path: Path, manifest: dict):
    data=path.read_bytes()
    if data[:4]!=b"MThd":
        raise ValueError(f"{path}: not a Standard MIDI File")
    hlen=struct.unpack(">I",data[4:8])[0]
    fmt,ntrks,division=struct.unpack(">HHH",data[8:14])
    if division&0x8000:
        raise ValueError("SMPTE time division is not supported")
    ppq=division
    pos=8+hlen
    parsed=[]
    max_tick=0
    tempos=[]
    timesigs=[]
    for ti in range(ntrks):
        if data[pos:pos+4]!=b"MTrk":
            raise ValueError(f"missing MTrk at byte {pos}")
        ln=struct.unpack(">I",data[pos+4:pos+8])[0]
        tr=parse_track(data[pos+8:pos+8+ln],ti,ppq)
        pos+=8+ln
        parsed.append(tr)
        tempos.extend(tr["tempos"])
        timesigs.extend(tr["timesigs"])
        if tr["notes"]:
            max_tick=max(max_tick,max(note[1] for note in tr["notes"]))
    source_duration=round(max_tick/ppq,9)
    source_tempo_map=[{"start":x["start"],"bpm":x["bpm"]} for x in uniq(tempos,("tick","bpm"))]
    source_meter_map=[{"start":x["start"],"meter":x["meter"]} for x in uniq(timesigs,("tick","meter"))]
    cfg=manifest.get("ingest",{})
    fallback=cfg.get("meterFallback","4/4")

    # Optional 1-based inclusive measure slicing for multi-movement source MIDIs.
    # The slice is computed from the source's own time-signature map before any
    # event normalization, then all retained events/control maps are shifted so
    # the movement begins at quarter-unit 0.
    segment=cfg.get("segmentMeasures")
    segment_meta=None
    if segment:
        start_measure=int(segment["start"])
        end_measure=int(segment["end"])
        full_measures=measures_for(source_duration,source_meter_map,fallback)
        if start_measure<1 or end_measure<start_measure or end_measure>len(full_measures):
            raise ValueError(
                f"{path}: invalid segmentMeasures {start_measure}-{end_measure}; "
                f"source has {len(full_measures)} measures"
            )
        selected=full_measures[start_measure-1:end_measure]
        segment_start=float(selected[0]["start"])
        segment_end=float(selected[-1]["start"])+float(selected[-1]["duration"])
        start_tick=round(segment_start*ppq)
        end_tick=round(segment_end*ppq)

        sliced=[]
        for tr in parsed:
            kept=[]
            for st,en,key,vel,channel in tr["notes"]:
                clip_st=max(st,start_tick)
                clip_en=min(en,end_tick)
                if clip_en>clip_st:
                    kept.append((clip_st-start_tick,clip_en-start_tick,key,vel,channel))
            copy=dict(tr)
            copy["notes"]=kept
            sliced.append(copy)
        parsed=sliced

        def shift_controls(items,value_key):
            before=[x for x in items if float(x["start"])<=segment_start+TOL]
            inside=[x for x in items if segment_start+TOL<float(x["start"])<segment_end-TOL]
            out=[]
            if before:
                out.append({"start":0.0,value_key:before[-1][value_key]})
            for item in inside:
                out.append({
                    "start":round(float(item["start"])-segment_start,9),
                    value_key:item[value_key],
                })
            return uniq(out,("start",value_key))

        tempo_map=shift_controls(source_tempo_map,"bpm")
        meter_map=shift_controls(source_meter_map,"meter")
        duration=round(segment_end-segment_start,9)
        output_measures=[
            {
                "label":str(i+1),
                "start":round(float(m["start"])-segment_start,9),
                "duration":round(float(m["duration"]),9),
            }
            for i,m in enumerate(selected)
        ]
        segment_meta={
            "startMeasure":start_measure,
            "endMeasure":end_measure,
            "sourceMeasureCount":len(full_measures),
            "sourceStartUnits":round(segment_start,9),
            "sourceEndUnits":round(segment_end,9),
        }
    else:
        duration=source_duration
        tempo_map=source_tempo_map
        meter_map=source_meter_map
        output_measures=measures_for(duration,meter_map,fallback)

    note_tracks=[tr for tr in parsed if tr["notes"]]
    used=set()
    tracks=[]
    for tr in note_tracks:
        channels=sorted({note[4] for note in tr["notes"]})
        by_channel={}
        for change in tr["programs"]:
            by_channel[change["channel"]]=change["program"]
        dominant=channels[0] if len(channels)==1 else None
        program=by_channel.get(dominant) if dominant is not None else (tr["programs"][0]["program"] if tr["programs"] else 0)
        instrument=program_instrument(program,dominant if dominant is not None else -1)
        base=slugify(tr["name"])
        if len(note_tracks)==2 and instrument=="piano":
            median=statistics.median(note[2] for note in tr["notes"])
            base="piano-rh" if median>=60 else "piano-lh"
        tid=base
        suffix=2
        while tid in used:
            tid=f"{base}-{suffix}"
            suffix+=1
        used.add(tid)
        median=statistics.median(note[2] for note in tr["notes"])
        clef="bass" if median<55 else "treble"
        if tid=="piano-rh":
            clef="treble"
        elif tid=="piano-lh":
            clef="bass"
        events=[]
        for st,en,key,vel,channel in sorted(tr["notes"],key=lambda n:(n[0],n[2],n[1])):
            if en<=st:
                continue
            events.append({
                "type":"note",
                "start":round(st/ppq,9),
                "duration":round((en-st)/ppq,9),
                "midi":key,
                "velocity":vel,
                "sourceTrack":tr["index"],
                "sourceChannel":channel,
            })
        track={
            "id":tid,
            "name":tr["name"],
            "role":f"source MIDI track {tr['index']}",
            "instrumentLabel":"Piano" if instrument=="piano" else instrument.title(),
            "defaultInstrument":instrument,
            "enabled":True,
            "level":float(cfg.get("trackLevel",0.72)),
            "pan":-0.12 if tid=="piano-rh" else (0.12 if tid=="piano-lh" else 0),
            "clef":clef,
            "sourceTrackIndex":tr["index"],
            "sourceChannels":channels,
            "gmProgram":program,
            "events":events,
        }
        for key,value in cfg.get("trackOverrides",{}).get(tid,{}).items():
            if key in {"name","role","instrumentLabel","defaultInstrument","enabled","level","pan","clef","gmProgram"}:
                track[key]=value
        tracks.append(track)
    if not tracks:
        raise ValueError(f"{path}: no note-bearing MIDI tracks")
    default_bpm=float(cfg.get("defaultBpm") or 0) or (tempo_map[0]["bpm"] if tempo_map else 60)
    source=manifest["source"]
    return {
        "schemaVersion":"1.0.0",
        "slug":manifest["slug"],
        "status":"available",
        "label":cfg.get("label") or manifest["identity"]["title"],
        "description":cfg.get("description","Complete licensed MIDI Full Rendition."),
        "fidelity":cfg.get("fidelity","source-midi-derived"),
        "durationUnits":duration,
        "musical":{
            "unitsPerQuarter":1,
            "defaultBpm":default_bpm,
            "bpmRange":cfg.get("bpmRange",[30,240]),
            "meter":meter_map[0]["meter"] if meter_map else fallback,
            "tempoMap":tempo_map,
            "meterMap":meter_map,
            "keyMap":[],
        },
        "measures":output_measures,
        "tracks":tracks,
        "provenance":{
            "provider":source.get("provider"),
            "url":source.get("sourcePage"),
            "sourceUrl":source.get("remoteUrl"),
            "license":source.get("license"),
            "licenseUrl":source.get("licenseUrl"),
            "attribution":source.get("attribution"),
            "vendoredPath":source.get("path"),
            "sha256":hashlib.sha256(data).hexdigest(),
            "bytes":len(data),
            "midiFormat":fmt,
            "ticksPerQuarter":ppq,
            "sourceTrackCount":ntrks,
            "sourceDurationUnits":source_duration,
            "segmentMeasures":segment_meta,
            "transformation":(
                "Parsed approved local Standard MIDI File; preserved note onset/duration, velocity, "
                "source track/channel identity, tempo events and time signatures."
                + (
                    f" Extracted source measures {segment_meta['startMeasure']}-{segment_meta['endMeasure']} "
                    "and shifted the retained movement to quarter-unit 0."
                    if segment_meta else ""
                )
            ),
        },
        "stats":{"tracks":len(tracks),"events":sum(len(track["events"]) for track in tracks)},
    }

def is_manifest(manifest):
    source=manifest.get("source",{})
    return (
        isinstance(source,dict)
        and str(source.get("path","")).lower().endswith((".mid",".midi"))
        and manifest.get("approval",{}).get("status")=="user-approved"
    )

def ingest_manifest(path: Path):
    manifest=json.loads(path.read_text(encoding="utf-8"))
    if not is_manifest(manifest):
        return None
    source=ROOT/manifest["source"]["path"]
    if not source.exists():
        raise FileNotFoundError(f"{path}: approved MIDI source missing: {source}")
    full=normalize(source,manifest)
    out=ROOT/manifest.get("output",f"data/ingested/{manifest['slug']}.full.json")
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(full,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"{manifest['slug']}: {full['stats']['tracks']} tracks, {full['stats']['events']} events, {full['durationUnits']} quarter units -> {out}")
    return full

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("manifest",nargs="?")
    ap.add_argument("--all",action="store_true")
    args=ap.parse_args()
    if args.all:
        for path in sorted(INTAKE.glob("*.json")):
            ingest_manifest(path)
    elif args.manifest:
        ingest_manifest(Path(args.manifest))
    else:
        ap.error("provide a manifest path or --all")

if __name__=="__main__":
    main()
