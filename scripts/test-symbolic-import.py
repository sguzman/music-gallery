#!/usr/bin/env python3
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import zipfile
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import import_symbolic_score as imp

FIXTURE='''<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>
      <midi-instrument id="P1-I1"><midi-program>1</midi-program></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>4</divisions><staves>2</staves>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><tie type="start"/></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff></note>
    </measure>
    <measure number="1">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><tie type="stop"/></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>'''

def manifest(source):
    return {
      "slug":"fixture",
      "identity":{"title":"Fixture"},
      "source":{"path":str(source),"provider":"fixture"},
      "ingest":{"defaultBpm":60,"bpmRange":[30,120],"failOnRepeats":True}
    }

with TemporaryDirectory() as td:
    td=Path(td)
    xml=td/"fixture.musicxml"
    xml.write_text(FIXTURE,encoding="utf-8")
    root,meta=imp.open_score(xml)
    full,warnings=imp.normalize_score(root,manifest(xml),meta)
    assert warnings == []
    assert full["durationUnits"] == 3
    assert [m["label"] for m in full["measures"]] == ["0","1"]
    assert [t["id"] for t in full["tracks"]] == ["piano-rh","piano-lh"]
    assert [t["clef"] for t in full["tracks"]] == ["treble","bass"]
    assert [len(t["events"]) for t in full["tracks"]] == [2,2]
    assert full["tracks"][0]["events"][0]["duration"] == 2
    assert {e["sourceStaff"] for e in full["tracks"][0]["events"]} == {1}
    assert {e["sourceStaff"] for e in full["tracks"][1]["events"]} == {2}

    mxl=td/"fixture.mxl"
    with zipfile.ZipFile(mxl,"w",compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("META-INF/container.xml",'<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>')
        zf.writestr("score.xml",FIXTURE)
    root,meta=imp.open_score(mxl)
    assert meta["containerRootfile"] == "score.xml"
    full2,warnings2=imp.normalize_score(root,manifest(mxl),meta)
    assert full2["stats"]["events"] == 4
    assert warnings2 == []

print("symbolic importer self-test: PASS")
