#!/usr/bin/env python3
import json, re, urllib.request, urllib.parse
from pathlib import Path

URLS = [
  "https://scoretail.com/en/sheet-music/requiem-in-d-minor-k-626-vii-agnus-dei-by-w-a-mozart-wolfgang-amadeus-mozart-qmrnujxd",
  "https://scoretail.com/embed/qmrnujxd",
  "https://scoretail.com/en/scores/qmrnujxd",
  "https://scoretail.com/scores/qmrnujxd",
]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153 Safari/537.36"
def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/xhtml+xml,application/javascript,*/*"})
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.status, r.geturl(), r.read()

out={"pages":[],"assets":[]}
assets=[]
for url in URLS:
    try:
        st, final, data=fetch(url)
        txt=data.decode("utf-8","replace")
        scripts=re.findall(r'<script[^>]+src=["\']([^"\']+)',txt,re.I)
        links=re.findall(r'<link[^>]+href=["\']([^"\']+)',txt,re.I)
        out["pages"].append({"url":url,"status":st,"final":final,"bytes":len(data),"scripts":scripts,"links":links,
          "qmrnujxd_context":[txt[max(0,m.start()-500):m.end()+1200] for m in list(re.finditer("qmrnujxd",txt,re.I))[:10]]})
        for s in scripts:
            assets.append(urllib.parse.urljoin(final,s))
    except Exception as e:
        out["pages"].append({"url":url,"error":repr(e)})

needles=["firebase","projectId","firestore","qmrnujxd","musicxml","export","download","scoreId","sheet-music","publicScores","scores/"]
for u in list(dict.fromkeys(assets))[:80]:
    try:
        st,final,data=fetch(u)
        txt=data.decode("utf-8","replace")
        low=txt.lower()
        if any(n.lower() in low for n in needles):
            snippets=[]
            for n in needles:
                for m in list(re.finditer(re.escape(n),txt,re.I))[:8]:
                    snippets.append({"needle":n,"text":txt[max(0,m.start()-400):m.end()+800]})
            out["assets"].append({"url":u,"status":st,"bytes":len(data),"snippets":snippets[:80]})
    except Exception as e:
        out["assets"].append({"url":u,"error":repr(e)})

Path("tmp").mkdir(exist_ok=True)
Path("tmp/scoretail-probe.json").write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding="utf-8")
print(json.dumps({"pages":[{k:v for k,v in p.items() if k not in ("qmrnujxd_context","links","scripts")} for p in out["pages"]],"matched_assets":len(out["assets"])},indent=2))
