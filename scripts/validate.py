#!/usr/bin/env python3
from pathlib import Path
import json, sys

ROOT=Path(__file__).resolve().parents[1]
SONGS=ROOT/"data/songs"
OPEN_MIDI={"e":64,"B":59,"G":55,"D":50,"A":45,"E":40}
TOL=1e-6


def err(errors,path,msg):
    errors.append(f"{path.name}: {msg}")


def section_duration(section):
    return sum(float(m.get("duration",0) or 0) for m in section.get("measures",[]))


def validate_sections(errors,path,sections,nominal,prefix="",require_tab=False):
    ids=set()
    for si,section in enumerate(sections):
        sid=section.get("id")
        section_name=f"{prefix}{sid or si}"
        if not sid:
            err(errors,path,f"{prefix}section {si} is missing id")
        elif sid in ids:
            err(errors,path,f"{prefix}duplicate section id {sid!r}")
        ids.add(sid)
        for mi,measure in enumerate(section.get("measures",[])):
            md=float(measure.get("duration",0) or 0)
            label=str(measure.get("label",mi))
            loc_measure=f"{section_name} measure {label}"
            if md<=0:
                err(errors,path,f"{loc_measure} duration must be > 0")
            is_partial=bool(measure.get("partial")) or label.strip().lower() in {"pickup","anacrusis"}
            if nominal>0 and not is_partial and abs(md-nominal)>TOL:
                err(errors,path,f"{loc_measure} duration {md:g} disagrees with nominal bar length {nominal:g}")
            if nominal>0 and is_partial and md>nominal+TOL:
                err(errors,path,f"{loc_measure} partial duration {md:g} exceeds nominal bar length {nominal:g}")
            for ei,event in enumerate(measure.get("events",[])):
                start=float(event.get("start",-1))
                dur=float(event.get("duration",0) or 0)
                loc=f"{loc_measure} event {ei}"
                if start<0:
                    err(errors,path,f"{loc} start must be >= 0")
                if dur<=0:
                    err(errors,path,f"{loc} duration must be > 0")
                if start+dur>md+TOL:
                    err(errors,path,f"{loc} ends at {start+dur:g}, past measure duration {md:g}")
                if event.get("type")!="note":
                    continue
                midi=event.get("midi")
                if not isinstance(midi,int) or not 0<=midi<=127:
                    err(errors,path,f"{loc} MIDI must be an integer from 0 to 127")
                if not require_tab:
                    continue
                string=event.get("string")
                fret=event.get("fret")
                if string not in OPEN_MIDI:
                    err(errors,path,f"{loc} has unknown guitar string {string!r}")
                if not isinstance(fret,int) or fret<0:
                    err(errors,path,f"{loc} fret must be a non-negative integer")
                if string in OPEN_MIDI and isinstance(fret,int) and isinstance(midi,int):
                    expected=OPEN_MIDI[string]+fret
                    if midi!=expected:
                        err(errors,path,f"{loc} MIDI {midi} disagrees with {string} fret {fret} (expected {expected})")


def validate_parts(errors,path,song,nominal):
    parts=song.get("parts",[])
    if not parts:
        return
    ids=set()
    groups={}
    for pi,part in enumerate(parts):
        pid=part.get("id")
        if not pid:
            err(errors,path,f"part {pi} is missing id")
            pid=f"part-{pi}"
        elif pid in ids:
            err(errors,path,f"duplicate part id {pid!r}")
        ids.add(pid)
        sections=part.get("sections",[])
        if not sections:
            err(errors,path,f"part {pid!r} has no sections")
            continue
        validate_sections(
            errors,path,sections,nominal,
            prefix=f"part {pid} / ",require_tab=bool(part.get("tab"))
        )
        group=str(part.get("playbackGroup","default"))
        signature={
            "part":pid,
            "total":sum(section_duration(s) for s in sections),
            "sections":[section_duration(s) for s in sections],
        }
        groups.setdefault(group,[]).append(signature)
    for group,members in groups.items():
        if len(members)<2:
            continue
        reference=members[0]
        for member in members[1:]:
            if abs(member["total"]-reference["total"])>TOL:
                err(errors,path,
                    f"playback group {group!r} is unsynchronized: {reference['part']} lasts {reference['total']:g} "
                    f"units but {member['part']} lasts {member['total']:g}"
                )
            if len(member["sections"])!=len(reference["sections"]):
                err(errors,path,
                    f"playback group {group!r} section-count mismatch between {reference['part']} and {member['part']}"
                )
                continue
            for si,(a,b) in enumerate(zip(reference["sections"],member["sections"])):
                if abs(a-b)>TOL:
                    err(errors,path,
                        f"playback group {group!r} section {si} duration mismatch: "
                        f"{reference['part']}={a:g}, {member['part']}={b:g}"
                    )


def validate_song(path):
    errors=[]
    try:
        song=json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"{path.name}: invalid JSON: {e}"]
    musical=song.get("musical",{})
    upq=float(musical.get("unitsPerQuarter",0) or 0)
    if upq<=0:
        err(errors,path,"musical.unitsPerQuarter must be > 0")
    bpm=float(musical.get("defaultBpm",0) or 0)
    if bpm<=0:
        err(errors,path,"musical.defaultBpm must be > 0")
    nominal=float(musical.get("nominalMeasureUnits",0) or 0)
    if nominal<0:
        err(errors,path,"musical.nominalMeasureUnits must be >= 0")

    validate_sections(errors,path,song.get("sections",[]),nominal,require_tab=True)
    validate_parts(errors,path,song,nominal)

    timing=song.get("verification",{}).get("timing",{})
    if timing.get("confidence")=="high":
        kinds=" ".join(str(s.get("kind","")).lower() for s in song.get("sources",[]))
        if not any(token in kinds for token in ("score","midi","musicxml","timestamp","audio")):
            err(errors,path,"high timing confidence requires a score/MIDI/MusicXML/timestamp/audio source")
    ensemble=song.get("verification",{}).get("ensembleTiming",{})
    if ensemble.get("confidence")=="high":
        kinds=" ".join(str(s.get("kind","")).lower() for s in song.get("sources",[]))
        if not any(token in kinds for token in ("score","midi","musicxml","lilypond")):
            err(errors,path,"high ensemble timing confidence requires a score/MIDI/MusicXML/LilyPond source")
    return errors


def main():
    errors=[]
    paths=sorted(SONGS.glob("*.json"))
    for path in paths:
        errors.extend(validate_song(path))
    if errors:
        print("Song validation failed:")
        for e in errors:
            print(" -",e)
        sys.exit(1)
    print(f"Validated {len(paths)} songs, including synchronized playback groups.")


if __name__=="__main__":
    main()
