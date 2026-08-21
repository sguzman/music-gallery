#!/usr/bin/env python3
from pathlib import Path
import json, html, re

ROOT=Path(__file__).resolve().parents[1]
SONGS=ROOT/"data/songs"
TEMPLATE=(ROOT/"templates/song.html").read_text(encoding="utf-8")
AUDIT_PATH=ROOT/"data/timing-audit.json"
AUDIT_DIR=ROOT/"data/timing-audits"
ENSEMBLE_DIR=ROOT/"data/ensembles"


def deep_merge(dst,src):
    for key,value in src.items():
        if isinstance(value,dict) and isinstance(dst.get(key),dict):
            deep_merge(dst[key],value)
        else:
            dst[key]=value
    return dst


def load_timing_audits():
    combined=json.loads(AUDIT_PATH.read_text(encoding="utf-8")) if AUDIT_PATH.exists() else {"songs":{}}
    combined.setdefault("songs",{})
    if AUDIT_DIR.exists():
        for path in sorted(AUDIT_DIR.glob("*.json")):
            payload=json.loads(path.read_text(encoding="utf-8"))
            if "slug" in payload:
                slug=payload["slug"]
                audit={k:v for k,v in payload.items() if k not in {"slug","schemaVersion"}}
                deep_merge(combined["songs"].setdefault(slug,{}),audit)
            else:
                for slug,audit in payload.get("songs",{}).items():
                    deep_merge(combined["songs"].setdefault(slug,{}),audit)
    return combined


TIMING_AUDIT=load_timing_audits()


def apply_measure_patches(song, patches):
    """Replace individual measures by section id + measure label.

    This is intentionally exact: an audit that names a missing or duplicated
    measure fails the build rather than silently landing on the wrong bar.
    """
    sections={section.get("id"):section for section in song.get("sections",[])}
    for section_id, measure_map in patches.items():
        section=sections.get(section_id)
        if section is None:
            raise ValueError(f"{song.get('slug')}: timing audit references missing section {section_id!r}")
        measures=section.get("measures",[])
        by_label={}
        for i,measure in enumerate(measures):
            by_label.setdefault(str(measure.get("label")),[]).append(i)
        for label,replacement in measure_map.items():
            matches=by_label.get(str(label),[])
            if len(matches)!=1:
                raise ValueError(
                    f"{song.get('slug')}: timing audit measure {section_id}/{label} "
                    f"matched {len(matches)} bars (expected exactly 1)"
                )
            measures[matches[0]]=replacement
    return song


def apply_timing_audit(song):
    audit=TIMING_AUDIT.get("songs",{}).get(song.get("slug"))
    if not audit:
        return song
    for key in ("musical","verification","playback"):
        if key in audit:
            deep_merge(song.setdefault(key,{}),audit[key])
    # A verified symbolic transcription may replace the legacy approximate
    # event grid wholesale. Lists are intentionally replaced, not deep-merged.
    if "sections" in audit:
        song["sections"]=audit["sections"]
    elif "measurePatches" in audit:
        apply_measure_patches(song,audit["measurePatches"])
    if "parts" in audit:
        song["parts"]=audit["parts"]
    if audit.get("status"):
        song.setdefault("verification",{})["timingAuditStatus"]=audit["status"]
    if audit.get("notes"):
        notes=song.setdefault("verification",{}).setdefault("notesAboutQuality",[])
        if audit["notes"] not in notes:
            notes.append(audit["notes"])
    source=audit.get("source")
    if source:
        sources=song.setdefault("sources",[])
        if not any(s.get("url")==source.get("url") for s in sources):
            sources.append(source)
    for source in audit.get("sources",[]):
        sources=song.setdefault("sources",[])
        if not any(s.get("url")==source.get("url") for s in sources):
            sources.append(source)
    return song


NOTE_BASE={"C":0,"D":2,"E":4,"F":5,"G":7,"A":9,"B":11}
PITCH_RE=re.compile(r"^([A-G])([#b]?)(-?\d+)$")


def pitch_to_midi(pitch):
    match=PITCH_RE.match(str(pitch))
    if not match:
        raise ValueError(f"invalid pitch name {pitch!r}; expected e.g. F#5")
    letter,accidental,octave=match.groups()
    semitone=NOTE_BASE[letter]+({"#":1,"b":-1}.get(accidental,0))
    midi=12*(int(octave)+1)+semitone
    if not 0<=midi<=127:
        raise ValueError(f"pitch {pitch!r} maps outside MIDI range: {midi}")
    return midi


def pattern_measure_events(items, measure_duration, context):
    """Compile one declarative source-score measure.

    Two representations are supported, deliberately at the data layer:

    * sequential shorthand: [pitch, duration], where events are contiguous and
      must fill the whole measure (the original Canon representation);
    * explicit events: {pitch, start, duration}, where gaps are rests and events
      may overlap, allowing chords/polyphony without lying about note lengths.

    A measure may use one representation or the other, never both.
    """
    if not items:
        return []
    modes={"explicit" if isinstance(item,dict) else "sequential" if isinstance(item,list) else "invalid" for item in items}
    if "invalid" in modes or len(modes)!=1:
        raise ValueError(f"{context}: measure must use either all [pitch,duration] shorthand or all explicit timed events")

    events=[]
    if "explicit" in modes:
        for item in items:
            if not {"pitch","start","duration"}.issubset(item):
                raise ValueError(f"{context}: explicit event requires pitch/start/duration, got {item!r}")
            pitch=item["pitch"]
            start=float(item["start"])
            duration=float(item["duration"])
            if start<0:
                raise ValueError(f"{context}: event start must be non-negative")
            if duration<=0:
                raise ValueError(f"{context}: duration must be positive")
            if start+duration>measure_duration+1e-6:
                raise ValueError(
                    f"{context}: event {pitch} ends at {start+duration:g}, beyond measure duration {measure_duration:g}"
                )
            events.append({
                "type":"note",
                "pitch":str(pitch),
                "midi":pitch_to_midi(pitch),
                "start":round(start,6),
                "duration":round(duration,6),
            })
        return sorted(events,key=lambda event:(event["start"],event["midi"],event["duration"]))

    start=0.0
    for item in items:
        if len(item)!=2:
            raise ValueError(f"{context}: pattern note must be [pitch,duration], got {item!r}")
        pitch,duration=item
        duration=float(duration)
        if duration<=0:
            raise ValueError(f"{context}: duration must be positive")
        events.append({
            "type":"note",
            "pitch":str(pitch),
            "midi":pitch_to_midi(pitch),
            "start":round(start,6),
            "duration":round(duration,6),
        })
        start+=duration
    if abs(start-measure_duration)>1e-6:
        raise ValueError(f"{context}: pattern totals {start:g}, expected {measure_duration:g}")
    return events


def build_ensemble_part(spec, part_spec):
    total=int(spec["totalMeasures"])
    measure_duration=float(spec["measureDuration"])
    delay=int(part_spec.get("delayMeasures",0))
    pattern_name=part_spec["pattern"]
    pattern=spec.get("patterns",{}).get(pattern_name)
    if not pattern:
        raise ValueError(f"{spec['slug']}: missing ensemble pattern {pattern_name!r}")
    repeat=bool(part_spec.get("repeatPattern"))
    measures=[]
    for i in range(total):
        pattern_index=i-delay
        notes=[]
        if pattern_index>=0:
            if repeat:
                notes=pattern[pattern_index%len(pattern)]
            elif pattern_index<len(pattern):
                notes=pattern[pattern_index]
        events=[] if not notes else pattern_measure_events(
            notes,measure_duration,f"{spec['slug']} {part_spec['id']} source measure {i+1}"
        )
        measures.append({
            "label":str(i+1),
            "duration":measure_duration,
            "events":events,
            "sourceMeasure":i+1,
        })
    sections=[]
    for window in spec.get("sections",[]):
        start=max(1,int(window["startMeasure"]))
        end=min(total,int(window["endMeasure"]))
        sections.append({
            "id":window["id"],
            "name":window["name"],
            "description":window.get("description",""),
            "measures":measures[start-1:end],
        })
    return {
        "id":part_spec["id"],
        "name":part_spec["name"],
        "role":part_spec.get("role","source part"),
        "defaultInstrument":part_spec.get("defaultInstrument","violin"),
        "enabled":part_spec.get("enabled",True),
        "tab":part_spec.get("tab",False),
        "playbackGroup":spec.get("playbackGroup","ensemble"),
        "sourceDerived":True,
        "sections":sections,
    }


def apply_ensemble_spec(song):
    path=ENSEMBLE_DIR/f"{song.get('slug')}.json"
    if not path.exists():
        return song
    spec=json.loads(path.read_text(encoding="utf-8"))
    if spec.get("slug")!=song.get("slug"):
        raise ValueError(f"{path.name}: slug disagrees with song")
    practice={
        "id":"practice-melody",
        "name":"Guitar practice reduction",
        "role":"independent beginner practice reduction",
        "defaultInstrument":song.get("playback",{}).get("defaultInstrument","guitar"),
        "enabled":True,
        "tab":True,
        "playbackGroup":"practice",
        "sourceDerived":False,
        "sections":song.get("sections",[]),
    }
    source_parts=[build_ensemble_part(spec,p) for p in spec.get("parts",[])]
    song["parts"]=[practice,*source_parts]
    group=spec.get("playbackGroup","ensemble")
    song["playbackGroups"]={
        "practice":{
            "name":"Guitar practice reduction",
            "kind":"practice",
            "tempoBpm":song.get("musical",{}).get("defaultBpm"),
        },
        group:{
            "name":spec.get("name","Source ensemble"),
            "kind":"source",
            "tempoBpm":spec.get("sourceTempoBpm"),
            "source":spec.get("source"),
        },
    }
    song.setdefault("verification",{})["ensembleTiming"]=spec.get("verification",{})
    source=spec.get("source")
    if source:
        sources=song.setdefault("sources",[])
        if not any(s.get("url")==source.get("url") for s in sources):
            sources.append(source)
    quality=song.setdefault("verification",{}).setdefault("notesAboutQuality",[])
    source_label=(source or {}).get("label","the cited source score")
    note=spec.get("qualityNote") or (
        f"The source ensemble is a separate score-derived excerpt from {source_label}. "
        "It is kept as an independent playback/provenance object from the beginner guitar reduction."
    )
    if note not in quality:
        quality.append(note)
    return song


def note_iter(song):
    for section in song.get("sections",[]):
        for measure in section.get("measures",[]):
            for event in measure.get("events",[]):
                if event.get("type")=="note":
                    yield event


def measure_iter(song):
    for section in song.get("sections",[]):
        yield from section.get("measures",[])


def enrich(song):
    notes=list(note_iter(song)); measures=list(measure_iter(song))
    total_units=sum(float(m.get("duration",0)) for m in measures)
    bpm=float(song["musical"]["defaultBpm"])
    units_per_quarter=float(song["musical"].get("unitsPerQuarter",1) or 1)
    quarter_notes=total_units/units_per_quarter
    song["stats"]={
        "sections":len(song.get("sections",[])),
        "measuresOrPracticeGroups":len(measures),
        "notes":len(notes),
        "uniqueMidiPitches":len({n.get("midi") for n in notes}),
        "minFret":min((n.get("fret",0) for n in notes),default=0),
        "maxFret":max((n.get("fret",0) for n in notes),default=0),
        "openStringNotes":sum(n.get("fret")==0 for n in notes),
        "anchorNotes":sum(bool(n.get("anchor")) for n in notes),
        "durationUnits":round(total_units,3),
        "durationQuarterNotes":round(quarter_notes,3),
        "estimatedSecondsAtDefaultTempo":round(quarter_notes*60/bpm,1)
    }
    terms=[
        song["identity"]["title"],song["identity"]["displayTitle"],song["identity"]["composer"]["name"],
        song["origin"].get("category"),song["origin"].get("era"),song["origin"].get("sourceMedium"),
        song["origin"].get("franchise"),song["arrangement"]["difficulty"]["label"],song["musical"]["meter"],
        song["arrangement"].get("arrangedKey"),song.get("verification",{}).get("timingAuditStatus"),
        *song["identity"].get("aliases",[]),*song["taxonomy"].get("genres",[]),
        *song["taxonomy"].get("moods",[]),*song["taxonomy"].get("tags",[]),
        *song["taxonomy"].get("techniques",[]),*song["taxonomy"].get("learningGoals",[])
    ]
    song.setdefault("search",{})["text"]=" ".join(str(x) for x in terms if x).lower()
    return song


def summary(song):
    return {
        "slug":song["slug"],"title":song["identity"]["title"],"displayTitle":song["identity"]["displayTitle"],
        "composer":song["identity"]["composer"]["name"],"description":song["presentation"]["description"],
        "accent":song["presentation"]["accent"],"category":song["origin"]["category"],"era":song["origin"]["era"],
        "year":song["origin"].get("year"),"sourceMedium":song["origin"].get("sourceMedium"),
        "franchise":song["origin"].get("franchise"),"difficulty":song["arrangement"]["difficulty"],
        "meter":song["musical"]["meter"],"tempoUnit":song["musical"]["tempoUnit"],
        "defaultBpm":song["musical"]["defaultBpm"],"arrangedKey":song["arrangement"].get("arrangedKey"),
        "maxFret":song["stats"]["maxFret"],"moods":song["taxonomy"].get("moods",[]),
        "genres":song["taxonomy"].get("genres",[]),"tags":song["taxonomy"].get("tags",[]),
        "timingMethod":song["verification"]["timing"]["method"],
        "timingConfidence":song["verification"]["timing"]["confidence"],
        "timingAuditStatus":song.get("verification",{}).get("timingAuditStatus"),
        "noteConfidence":song["verification"]["notes"]["confidence"],
        "instrumentOptions":song["playback"]["instrumentOptions"],
        "estimatedSeconds":song["stats"]["estimatedSecondsAtDefaultTempo"],
        "searchText":song["search"]["text"],"href":f"songs/{song['slug']}/"
    }


def wrapper(song):
    jsonld={
      "@context":"https://schema.org","@type":"MusicComposition","name":song["identity"]["title"],
      "composer":{"@type":"Person","name":song["identity"]["composer"]["name"]},
      "musicCompositionForm":(song["taxonomy"].get("genres") or ["melody"])[0],
      "musicalKey":song["origin"].get("originalKey"),
      "isPartOf":song["origin"].get("franchise"),
      "description":song["presentation"]["description"]
    }
    jsonld={k:v for k,v in jsonld.items() if v is not None}
    return (TEMPLATE
      .replace("{{PAGE_TITLE}}",html.escape(song["identity"]["displayTitle"]+" — Music Gallery",quote=True))
      .replace("{{DESCRIPTION}}",html.escape(song["presentation"]["description"],quote=True))
      .replace("{{DISPLAY_TITLE}}",html.escape(song["identity"]["displayTitle"],quote=True))
      .replace("{{COMPOSER}}",html.escape(song["identity"]["composer"]["name"],quote=True))
      .replace("{{SLUG}}",song["slug"])
      .replace("{{JSON_LD}}",json.dumps(jsonld,ensure_ascii=False,indent=2))
    )


def main():
    catalog=[]
    for path in sorted(SONGS.glob("*.json")):
        song=json.loads(path.read_text(encoding="utf-8"))
        song=apply_timing_audit(song)
        song=apply_ensemble_spec(song)
        song=enrich(song)
        path.write_text(json.dumps(song,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        catalog.append(summary(song))
        out=ROOT/"songs"/song["slug"]/"index.html"
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(wrapper(song),encoding="utf-8")
    (ROOT/"data/catalog.json").write_text(json.dumps({"schemaVersion":"1.0.0","songs":catalog},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Built {len(catalog)} songs with timing audits and ensemble overlays.")


if __name__=="__main__":
    main()
