#!/usr/bin/env python3
from pathlib import Path
import json, sys

ROOT=Path(__file__).resolve().parents[1]
SONGS=ROOT/"data/songs"
OPEN_MIDI={"e":64,"B":59,"G":55,"D":50,"A":45,"E":40}
TOL=1e-6

def err(errors,path,msg): errors.append(f"{path.name}: {msg}")

def validate_song(path):
    errors=[]
    try: song=json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"{path.name}: invalid JSON: {e}"]
    upq=float(song.get("musical",{}).get("unitsPerQuarter",0) or 0)
    if upq<=0: err(errors,path,"musical.unitsPerQuarter must be > 0")
    bpm=float(song.get("musical",{}).get("defaultBpm",0) or 0)
    if bpm<=0: err(errors,path,"musical.defaultBpm must be > 0")
    ids=set()
    for si,section in enumerate(song.get("sections",[])):
        sid=section.get("id")
        if not sid: err(errors,path,f"section {si} is missing id")
        elif sid in ids: err(errors,path,f"duplicate section id {sid!r}")
        ids.add(sid)
        for mi,measure in enumerate(section.get("measures",[])):
            md=float(measure.get("duration",0) or 0)
            if md<=0: err(errors,path,f"{sid or si} measure {mi} duration must be > 0")
            for ei,event in enumerate(measure.get("events",[])):
                start=float(event.get("start",-1))
                dur=float(event.get("duration",0) or 0)
                loc=f"{sid or si} measure {mi} event {ei}"
                if start<0: err(errors,path,f"{loc} start must be >= 0")
                if dur<=0: err(errors,path,f"{loc} duration must be > 0")
                if start+dur>md+TOL: err(errors,path,f"{loc} ends at {start+dur:g}, past measure duration {md:g}")
                if event.get("type")=="note":
                    string=event.get("string");fret=event.get("fret");midi=event.get("midi")
                    if string not in OPEN_MIDI: err(errors,path,f"{loc} has unknown guitar string {string!r}")
                    if not isinstance(fret,int) or fret<0: err(errors,path,f"{loc} fret must be a non-negative integer")
                    if string in OPEN_MIDI and isinstance(fret,int) and isinstance(midi,int):
                        expected=OPEN_MIDI[string]+fret
                        if midi!=expected: err(errors,path,f"{loc} MIDI {midi} disagrees with {string} fret {fret} (expected {expected})")
    timing=song.get("verification",{}).get("timing",{})
    if timing.get("confidence")=="high":
        kinds=" ".join(str(s.get("kind","")).lower() for s in song.get("sources",[]))
        if not any(token in kinds for token in ("score","midi","musicxml","timestamp","audio")):
            err(errors,path,"high timing confidence requires a score/MIDI/MusicXML/timestamp/audio source")
    return errors

def main():
    errors=[]
    paths=sorted(SONGS.glob("*.json"))
    for path in paths: errors.extend(validate_song(path))
    if errors:
        print("Song validation failed:")
        for e in errors: print(" -",e)
        sys.exit(1)
    print(f"Validated {len(paths)} songs.")

if __name__=="__main__": main()
