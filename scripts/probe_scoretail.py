#!/usr/bin/env python3
import json, re, urllib.request, urllib.parse
from pathlib import Path

URLS = [
  "https://scoretail.com/en/sheet-music/requiem-in-d-minor-k-626-vii-agnus-dei-by-w-a-mozart-wolfgang-amadeus-mozart-qmrnujxd",
  "https://scoretail.com/embed/qmrnujxd",
  "https://scoretail.com/en/scores/qmrnujxd",
  "https://scoretail.com/scores/qmrnujxd",
]
STATIC = [
  "https://scoretail.com/_next/static/chunks/app/%5Blocale%5D/sheet-music/%5Bslug%5D/page-680012734fd6c586.js?dpl=dpl_DeUzUk9c5moiv2Tn61dnKhGZYJqC",
  "https://scoretail.com/_next/static/chunks/8736-029037929767620c.js?dpl=dpl_DeUzUk9c5moiv2Tn61dnKhGZYJqC",
  "https://scoretail.com/_next/static/chunks/b157fc76-49991b52be59f00d.js?dpl=dpl_DeUzUk9c5moiv2Tn61dnKhGZYJqC",
  "https://scoretail.com/_next/static/chunks/webpack-27be309e695e6bb5.js?dpl=dpl_DeUzUk9c5moiv2Tn61dnKhGZYJqC",
  "https://scoretail.com/_next/static/chunks/2222-921c9d83b52c767b.js?dpl=dpl_22JDTw4BidM58crfzr4RjUcrsj7n",
  "https://scoretail.com/_next/static/chunks/8736-77106b9327df2765.js?dpl=dpl_22JDTw4BidM58crfzr4RjUcrsj7n",
]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153 Safari/537.36"
def fetch(url):
    req=urllib.request.Request(url,headers={
      "User-Agent":UA,
      "Accept":"text/html,application/xhtml+xml,application/javascript,*/*",
      "Referer":"https://scoretail.com/",
      "Accept-Language":"en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.status, r.geturl(), r.read()

out={"pages":[],"assets":[]}
assets=list(STATIC)
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

needles=["firebase","projectId","firestore","qmrnujxd","musicxml","export","download","scoreId","sheet-music","publicScores","scores/","getDoc","collection(","storageBucket","apiKey"]
for u in list(dict.fromkeys(assets))[:100]:
    try:
        st,final,data=fetch(u)
        txt=data.decode("utf-8","replace")
        low=txt.lower()
        snippets=[]
        for n in needles:
            for m in list(re.finditer(re.escape(n),txt,re.I))[:12]:
                snippets.append({"needle":n,"text":txt[max(0,m.start()-700):m.end()+1400]})
        out["assets"].append({"url":u,"status":st,"bytes":len(data),"snippets":snippets[:120]})
    except Exception as e:
        out["assets"].append({"url":u,"error":repr(e)})

Path("tmp").mkdir(exist_ok=True)
Path("tmp/scoretail-probe.json").write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding="utf-8")
print(json.dumps({"pages":[{k:v for k,v in p.items() if k not in ("qmrnujxd_context","links","scripts")} for p in out["pages"]],"assets":[{"url":a["url"],"status":a.get("status"),"bytes":a.get("bytes"),"error":a.get("error"),"snippets":len(a.get("snippets",[]))} for a in out["assets"]]},indent=2))
