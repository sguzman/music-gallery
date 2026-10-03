#!/usr/bin/env python3
"""Normalize approved local MusicXML/MXL sources into Musicarium Full Rendition artifacts.

This importer never fetches from the network. Source acquisition is a separate,
explicit intake step; the importer only reads vendored files under data/sources.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import argparse
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
INTAKE = ROOT / "data" / "intake"
INGESTED = ROOT / "data" / "ingested"
IMPORTER_VERSION = "1.0.0"
TOL = 1e-9

SUPPORTED_SYNTHS = {
    "piano": "piano",
    "celesta": "celesta",
    "violin": "violin",
    "violoncello": "cello",
    "cello": "cello",
    "string": "strings",
    "flute": "flute",
    "oboe": "oboe",
    "clarinet": "clarinet",
    "bassoon": "bassoon",
    "guitar": "guitar",
    "voice": "voice",
    "vocal": "voice",
}

def lname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]

def children(node, name):
    return [c for c in list(node) if lname(c.tag) == name]

def child(node, name):
    for c in list(node):
        if lname(c.tag) == name:
            return c
    return None

def descendant(node, name):
    for c in node.iter():
        if lname(c.tag) == name:
            return c
    return None

def text_child(node, name, default=None):
    c = child(node, name)
    if c is None or c.text is None:
        return default
    return c.text.strip()

def desc_text(node, name, default=None):
    c = descendant(node, name)
    if c is None or c.text is None:
        return default
    return c.text.strip()

def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def slugify(value: str) -> str:
    value = value.lower().replace("♭", "b").replace("♯", "sharp")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "part"

def clef_name(sign, line):
    sign = (sign or "").upper()
    if sign == "G":
        return "treble"
    if sign == "F":
        return "bass"
    if sign == "C" and str(line) == "3":
        return "alto"
    if sign == "C" and str(line) == "4":
        return "tenor"
    return sign.lower() or "treble"

def synth_for(label: str) -> str:
    low = (label or "").lower()
    for key, synth in SUPPORTED_SYNTHS.items():
        if key in low:
            return synth
    return "piano"

def open_score(path: Path):
    if path.suffix.lower() == ".mxl" or zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as zf:
            rootfile = None
            if "META-INF/container.xml" in zf.namelist():
                container = ET.fromstring(zf.read("META-INF/container.xml"))
                for node in container.iter():
                    if lname(node.tag) == "rootfile" and node.attrib.get("full-path"):
                        rootfile = node.attrib["full-path"]
                        break
            if rootfile is None:
                candidates = [n for n in zf.namelist() if n.lower().endswith((".xml", ".musicxml")) and not n.startswith("META-INF/")]
                if not candidates:
                    raise ValueError(f"{path}: MXL contains no score XML")
                rootfile = candidates[0]
            root = ET.fromstring(zf.read(rootfile))
            return root, {"containerRootfile": rootfile}
    return ET.parse(path).getroot(), {"containerRootfile": None}

def score_part_definitions(root):
    defs = {}
    part_list = child(root, "part-list")
    if part_list is None:
        return defs
    for sp in children(part_list, "score-part"):
        pid = sp.attrib.get("id") or f"part-{len(defs)+1}"
        name = text_child(sp, "part-name", pid)
        inst = desc_text(sp, "instrument-name", name)
        program = desc_text(sp, "midi-program")
        defs[pid] = {
            "name": name,
            "instrument": inst,
            "gmProgram": max(0, min(127, int(number(program, 1)) - 1)) if program is not None else None,
        }
    return defs

def parse_pitch(note, transpose):
    pitch = child(note, "pitch")
    if pitch is None:
        return None
    step = text_child(pitch, "step")
    octave = text_child(pitch, "octave")
    if step is None or octave is None:
        return None
    alter = number(text_child(pitch, "alter"), 0)
    semitone = {"C":0, "D":2, "E":4, "F":5, "G":7, "A":9, "B":11}[step.upper()]
    midi = 12 * (int(octave) + 1) + semitone + alter + transpose
    rounded = round(midi)
    if abs(midi - rounded) > TOL:
        raise ValueError(f"microtonal pitch {midi} cannot be represented by current integer-MIDI renderer")
    return int(rounded)

def parse_part(part, pdef):
    state = {
        "divisions": 1.0,
        "transpose": 0,
        "staves": 1,
    }
    initial_clefs = {}
    measures = []
    tempos = []
    meters = []
    keys = []
    repeats = []
    max_staff_seen = 1

    for mi, measure in enumerate(children(part, "measure")):
        label = measure.attrib.get("number", str(mi + 1))
        cursor = 0.0
        max_end = 0.0
        last_start = {}
        grace_counts = defaultdict(int)
        segments = []

        for node in list(measure):
            tag = lname(node.tag)

            if tag == "attributes":
                div = text_child(node, "divisions")
                if div is not None:
                    state["divisions"] = max(number(div, 1.0), TOL)
                staves = text_child(node, "staves")
                if staves is not None:
                    state["staves"] = max(1, int(number(staves, 1)))
                tr = child(node, "transpose")
                if tr is not None:
                    chrom = number(text_child(tr, "chromatic"), 0)
                    octv = number(text_child(tr, "octave-change"), 0)
                    state["transpose"] = int(chrom + 12 * octv)
                tm = child(node, "time")
                if tm is not None:
                    beats = text_child(tm, "beats")
                    beat_type = text_child(tm, "beat-type")
                    if beats and beat_type:
                        meters.append({"measureIndex": mi, "offset": cursor, "meter": f"{beats}/{beat_type}"})
                ky = child(node, "key")
                if ky is not None:
                    fifths = text_child(ky, "fifths")
                    if fifths is not None:
                        keys.append({"measureIndex": mi, "offset": cursor, "fifths": int(number(fifths, 0))})
                for cl in children(node, "clef"):
                    staff = int(number(cl.attrib.get("number"), 1))
                    initial_clefs.setdefault(staff, clef_name(text_child(cl, "sign"), text_child(cl, "line")))
                continue

            if tag == "direction":
                sound = descendant(node, "sound")
                if sound is not None and sound.attrib.get("tempo") is not None:
                    off = number(text_child(node, "offset"), 0) / state["divisions"]
                    tempos.append({"measureIndex": mi, "offset": max(0.0, cursor + off), "bpm": number(sound.attrib.get("tempo"), 0)})
                continue

            if tag == "backup":
                cursor -= number(text_child(node, "duration"), 0) / state["divisions"]
                cursor = max(0.0, cursor)
                continue

            if tag == "forward":
                cursor += number(text_child(node, "duration"), 0) / state["divisions"]
                max_end = max(max_end, cursor)
                continue

            if tag == "barline":
                rep = child(node, "repeat")
                if rep is not None:
                    repeats.append({"measureIndex": mi, "direction": rep.attrib.get("direction")})
                ending = child(node, "ending")
                if ending is not None:
                    repeats.append({"measureIndex": mi, "ending": ending.attrib.get("number"), "type": ending.attrib.get("type")})
                continue

            if tag != "note":
                continue

            duration_raw = number(text_child(node, "duration"), 0)
            duration = duration_raw / state["divisions"] if duration_raw else 0.0
            staff = int(number(text_child(node, "staff"), 1))
            voice = text_child(node, "voice", "1")
            max_staff_seen = max(max_staff_seen, staff)
            is_chord = child(node, "chord") is not None
            is_grace = child(node, "grace") is not None
            is_rest = child(node, "rest") is not None
            key = (staff, voice)
            start = last_start.get(key, cursor) if is_chord else cursor
            if not is_chord and not is_grace:
                last_start[key] = start

            midi = None if is_rest else parse_pitch(node, state["transpose"])
            tie_types = {t.attrib.get("type") for t in children(node, "tie") if t.attrib.get("type")}

            if midi is not None:
                if is_grace:
                    grace_counts[key] += 1
                    grace_dur = 1.0 / 32.0
                    grace_start = max(0.0, cursor - grace_dur * grace_counts[key])
                    segments.append({
                        "measureIndex": mi,
                        "measureLabel": label,
                        "relStart": grace_start,
                        "duration": grace_dur,
                        "midi": midi,
                        "staff": staff,
                        "voice": voice,
                        "tieTypes": [],
                        "grace": True,
                    })
                elif duration > 0:
                    grace_counts[key] = 0
                    segments.append({
                        "measureIndex": mi,
                        "measureLabel": label,
                        "relStart": start,
                        "duration": duration,
                        "midi": midi,
                        "staff": staff,
                        "voice": voice,
                        "tieTypes": sorted(tie_types),
                        "grace": False,
                    })

            if not is_chord and not is_grace:
                cursor += duration
                max_end = max(max_end, cursor, start + duration)
            elif not is_grace:
                max_end = max(max_end, start + duration)

        measures.append({
            "label": label,
            "duration": max(max_end, cursor),
            "segments": segments,
        })

    return {
        "partId": part.attrib.get("id"),
        "definition": pdef,
        "measures": measures,
        "tempos": tempos,
        "meters": meters,
        "keys": keys,
        "repeats": repeats,
        "initialClefs": initial_clefs,
        "staffCount": max(max_staff_seen, state["staves"]),
    }

def dedupe_map(items, key_fields):
    seen = set()
    out = []
    for item in items:
        key = tuple(item.get(k) for k in key_fields)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out

def merge_ties(segments):
    segments = sorted(segments, key=lambda s: (s["start"], s["midi"], str(s["voice"])))
    events = []
    active = {}
    warnings = []
    for seg in segments:
        key = (str(seg["voice"]), seg["midi"])
        stop = "stop" in seg["tieTypes"]
        start_tie = "start" in seg["tieTypes"]
        if stop and key in active:
            ev = active[key]
            ev["duration"] = round((seg["start"] + seg["duration"]) - ev["start"], 9)
            if not start_tie:
                active.pop(key, None)
            continue

        ev = {
            "type": "note",
            "start": round(seg["start"], 9),
            "duration": round(seg["duration"], 9),
            "midi": seg["midi"],
            "sourceMeasure": seg["measureLabel"],
            "sourceMeasureIndex": seg["measureIndex"],
            "sourceVoice": int(seg["voice"]) if str(seg["voice"]).isdigit() else str(seg["voice"]),
            "sourceStaff": seg["staff"],
        }
        if seg.get("grace"):
            ev["grace"] = True
        events.append(ev)
        if start_tie:
            active[key] = ev
        elif stop:
            warnings.append(f"tie stop without matching start for voice={seg['voice']} midi={seg['midi']} at measure {seg['measureLabel']}")
    if active:
        warnings.append(f"{len(active)} unterminated tie chain(s) at end of score")
    return events, warnings

def track_identity(part_name, instrument_name, staff, staff_count, used_ids):
    base = slugify(part_name or instrument_name or "part")
    low = (instrument_name or part_name or "").lower()
    if staff_count > 1 and "piano" in low:
        if staff == 1:
            tid, name, role, pan = "piano-rh", "Piano — upper staff", "right-hand / upper-staff notation", -0.12
        elif staff == 2:
            tid, name, role, pan = "piano-lh", "Piano — lower staff", "left-hand / lower-staff notation", 0.12
        else:
            tid, name, role, pan = f"piano-staff-{staff}", f"Piano — staff {staff}", f"piano staff {staff}", 0
    elif staff_count > 1:
        tid, name, role, pan = f"{base}-staff-{staff}", f"{part_name} — staff {staff}", f"source staff {staff}", 0
    else:
        tid, name, role, pan = base, part_name or instrument_name or base, "source part", 0
    original = tid
    n = 2
    while tid in used_ids:
        tid = f"{original}-{n}"
        n += 1
    used_ids.add(tid)
    return tid, name, role, pan

def normalize_score(root, manifest, source_meta):
    if lname(root.tag) != "score-partwise":
        raise ValueError("only MusicXML score-partwise is currently supported")

    defs = score_part_definitions(root)
    parsed_parts = []
    all_repeats = []
    for part in children(root, "part"):
        pid = part.attrib.get("id")
        parsed = parse_part(part, defs.get(pid, {"name": pid or "Part", "instrument": pid or "Part", "gmProgram": None}))
        parsed_parts.append(parsed)
        all_repeats.extend(parsed["repeats"])

    if not parsed_parts:
        raise ValueError("score contains no parts")
    if all_repeats and manifest.get("ingest", {}).get("failOnRepeats", True):
        raise ValueError(f"score contains repeat/ending marks that require explicit form expansion: {all_repeats[:8]}")

    measure_count = max(len(p["measures"]) for p in parsed_parts)
    labels = []
    durations = []
    for mi in range(measure_count):
        label = None
        duration = 0.0
        for part in parsed_parts:
            if mi < len(part["measures"]):
                label = label or part["measures"][mi]["label"]
                duration = max(duration, part["measures"][mi]["duration"])
        labels.append(label or str(mi + 1))
        durations.append(duration)

    starts = []
    cursor = 0.0
    for d in durations:
        starts.append(cursor)
        cursor += d

    measures = [
        {"label": labels[i], "start": round(starts[i], 9), "duration": round(durations[i], 9)}
        for i in range(measure_count)
    ]

    track_level = number(manifest.get("ingest", {}).get("trackLevel"), 0.82)
    tracks = []
    warnings = []
    used_ids = set()

    for part in parsed_parts:
        by_staff = defaultdict(list)
        for measure in part["measures"]:
            for seg in measure["segments"]:
                seg = dict(seg)
                seg["start"] = starts[seg["measureIndex"]] + seg["relStart"]
                by_staff[seg["staff"]].append(seg)

        pdef = part["definition"]
        for staff in sorted(by_staff):
            events, tie_warnings = merge_ties(by_staff[staff])
            warnings.extend(f"{pdef['name']} staff {staff}: {w}" for w in tie_warnings)
            if not events:
                continue
            tid, name, role, pan = track_identity(pdef["name"], pdef["instrument"], staff, part["staffCount"], used_ids)
            track = {
                "id": tid,
                "name": name,
                "role": role,
                "instrumentLabel": pdef["instrument"] or pdef["name"],
                "defaultInstrument": synth_for(pdef["instrument"] or pdef["name"]),
                "enabled": True,
                "level": track_level,
                "pan": pan,
                "clef": part["initialClefs"].get(staff, "treble" if staff == 1 else "bass"),
                "sourcePartId": part["partId"],
                "sourceStaff": staff,
                "events": events,
            }
            if pdef.get("gmProgram") is not None:
                track["gmProgram"] = pdef["gmProgram"]
            tracks.append(track)

    tempo_raw = []
    meter_raw = []
    key_raw = []
    for part in parsed_parts:
        for t in part["tempos"]:
            if t["measureIndex"] < len(starts):
                tempo_raw.append({"start": round(starts[t["measureIndex"]] + t["offset"], 9), "bpm": t["bpm"]})
        for m in part["meters"]:
            if m["measureIndex"] < len(starts):
                meter_raw.append({"start": round(starts[m["measureIndex"]] + m["offset"], 9), "meter": m["meter"]})
        for k in part["keys"]:
            if k["measureIndex"] < len(starts):
                key_raw.append({"start": round(starts[k["measureIndex"]] + k["offset"], 9), "fifths": k["fifths"]})

    tempo_map = dedupe_map(sorted(tempo_raw, key=lambda x: (x["start"], x["bpm"])), ("start", "bpm"))
    meter_map = dedupe_map(sorted(meter_raw, key=lambda x: (x["start"], x["meter"])), ("start", "meter"))
    key_map = dedupe_map(sorted(key_raw, key=lambda x: (x["start"], x["fifths"])), ("start", "fifths"))

    ingest_cfg = manifest.get("ingest", {})
    default_bpm = number(ingest_cfg.get("defaultBpm"), 0)
    if default_bpm <= 0:
        default_bpm = next((t["bpm"] for t in tempo_map if t["bpm"] > 0), 60)

    identity = manifest.get("identity", {})
    source = manifest["source"]
    provenance = {
        "provider": source.get("provider"),
        "sourceRepository": source.get("sourceRepository"),
        "sourceRepositoryCommit": source.get("sourceRepositoryCommit"),
        "sourcePath": source.get("sourcePath"),
        "sourceBlobSha": source.get("sourceBlobSha"),
        "license": source.get("license"),
        "vendoredPath": source.get("path"),
        "containerRootfile": source_meta.get("containerRootfile"),
        "transformation": "Parsed local MusicXML/MXL with note/chord/rest/backup/forward timing semantics; preserved source parts, staves and voices; converted timing to quarter-note units; merged tie continuations without flattening grand-staff structure.",
        "caveat": source.get("caveat"),
        "importerVersion": IMPORTER_VERSION,
    }
    provenance = {k: v for k, v in provenance.items() if v is not None}

    full = {
        "status": "available",
        "label": ingest_cfg.get("label") or f"{identity.get('title', manifest['slug'])} — complete symbolic-score rendition",
        "description": ingest_cfg.get("description") or "Complete symbolic-score event graph preserving source part/staff structure.",
        "fidelity": ingest_cfg.get("fidelity", "transcription-derived"),
        "musical": {
            "meter": meter_map[0]["meter"] if meter_map else ingest_cfg.get("meter", "unknown"),
            "tempoUnit": "quarter note",
            "unitsPerQuarter": 1,
            "defaultBpm": default_bpm,
            "bpmRange": ingest_cfg.get("bpmRange", [max(20, int(default_bpm * 0.5)), int(default_bpm * 1.75)]),
            "tempoMap": tempo_map,
            "meterMap": meter_map,
            "keyMap": key_map,
        },
        "durationUnits": round(cursor, 9),
        "measures": measures,
        "tracks": tracks,
        "provenance": provenance,
        "stats": {
            "parts": len(parsed_parts),
            "renderTracks": len(tracks),
            "events": sum(len(t["events"]) for t in tracks),
            "graceEvents": sum(sum(1 for e in t["events"] if e.get("grace")) for t in tracks),
        },
    }
    return full, warnings

def ingest_manifest(path: Path):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    source_path = ROOT / manifest["source"]["path"]
    if not source_path.exists():
        raise FileNotFoundError(f"{path.name}: missing vendored source {source_path.relative_to(ROOT)}")
    root, source_meta = open_score(source_path)
    full, warnings = normalize_score(root, manifest, source_meta)
    artifact = {
        "schemaVersion": "1.0.0",
        "slug": manifest["slug"],
        "identity": manifest.get("identity", {}),
        "source": manifest["source"],
        "fullVersion": full,
        "ingest": {
            "importerVersion": IMPORTER_VERSION,
            "warnings": warnings,
        },
    }
    output = ROOT / manifest.get("output", f"data/ingested/{manifest['slug']}.full.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{manifest['slug']}: {full['stats']['events']} events, {full['stats']['renderTracks']} tracks, {len(full['measures'])} measures -> {output.relative_to(ROOT)}")
    for warning in warnings:
        print(f"  warning: {warning}")
    return output

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    paths = [ROOT / p for p in args.manifest]
    if args.all:
        paths.extend(sorted(INTAKE.glob("*.json")))
    paths = list(dict.fromkeys(paths))
    if not paths:
        ap.error("use --all or at least one --manifest")
    for path in paths:
        ingest_manifest(path)

if __name__ == "__main__":
    main()
