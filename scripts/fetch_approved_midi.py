#!/usr/bin/env python3
"""Fetch explicitly user-approved, redistributable MIDI witnesses into data/sources."""
from pathlib import Path
import argparse, hashlib, json, urllib.request

ROOT=Path(__file__).resolve().parents[1]
INTAKE=ROOT/"data"/"intake"
UA="Musicarium approved-source fetcher/1.0 (+https://github.com/sguzman/music-gallery)"

def eligible(manifest):
    source=manifest.get("source",{})
    return (
        manifest.get("approval",{}).get("status")=="user-approved"
        and isinstance(source,dict)
        and source.get("remoteUrl")
        and str(source.get("path","")).lower().endswith((".mid",".midi"))
        and source.get("license")
    )

def fetch_manifest(path: Path, force=False):
    manifest=json.loads(path.read_text(encoding="utf-8"))
    if not eligible(manifest):
        return None
    source=manifest["source"]
    out=ROOT/source["path"]
    if out.exists() and not force:
        data=out.read_bytes()
    else:
        out.parent.mkdir(parents=True,exist_ok=True)
        request=urllib.request.Request(source["remoteUrl"],headers={"User-Agent":UA})
        with urllib.request.urlopen(request,timeout=45) as response:
            data=response.read()
        if not data.startswith(b"MThd"):
            raise ValueError(f"{manifest['slug']}: downloaded source is not MIDI")
        out.write_bytes(data)
    digest=hashlib.sha256(data).hexdigest()
    expected=source.get("expectedSha256")
    if expected and expected.lower()!=digest:
        raise ValueError(f"{manifest['slug']}: SHA-256 mismatch: expected {expected}, got {digest}")
    print(f"{manifest['slug']}: {len(data)} bytes sha256={digest} -> {out}")
    return digest

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--all",action="store_true")
    ap.add_argument("--force",action="store_true")
    ap.add_argument("manifest",nargs="?")
    args=ap.parse_args()
    if args.all:
        for path in sorted(INTAKE.glob("*.json")):
            fetch_manifest(path,args.force)
    elif args.manifest:
        fetch_manifest(Path(args.manifest),args.force)
    else:
        ap.error("provide manifest or --all")

if __name__=="__main__":
    main()
