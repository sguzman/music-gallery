#!/usr/bin/env python3
from pathlib import Path
import json, html

ROOT=Path(__file__).resolve().parents[1]
SONGS=ROOT/"data/songs"
TEMPLATE=(ROOT/"templates/song.html").read_text(encoding="utf-8")

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
        "estimatedSecondsAtDefaultTempo":round(total_units*60/bpm,1)
    }
    terms=[
        song["identity"]["title"],song["identity"]["displayTitle"],song["identity"]["composer"]["name"],
        song["origin"].get("category"),song["origin"].get("era"),song["origin"].get("sourceMedium"),
        song["origin"].get("franchise"),song["arrangement"]["difficulty"]["label"],song["musical"]["meter"],
        song["arrangement"].get("arrangedKey"),
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
        song=enrich(json.loads(path.read_text(encoding="utf-8")))
        path.write_text(json.dumps(song,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        catalog.append(summary(song))
        out=ROOT/"songs"/song["slug"]/"index.html"
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(wrapper(song),encoding="utf-8")
    (ROOT/"data/catalog.json").write_text(json.dumps({"schemaVersion":"1.0.0","songs":catalog},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Built {len(catalog)} songs.")

if __name__=="__main__":
    main()
