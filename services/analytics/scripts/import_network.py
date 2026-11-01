"""Import a runnable network region from OpenStreetMap into PostGIS.

    python scripts/import_network.py --region calgary --bbox -114.13,51.035,-114.03,51.070 \
        [--elevation open-meteo] [--from-file extract.json] [--apply] [--replace-existing]

Default: validate/dry-run. Writes use NETWORK_ADMIN_DATABASE_URL from the environment.

Data: (c) OpenStreetMap contributors, ODbL 1.0, via the Overpass API (identify
yourself with a User-Agent; respect its usage policy: large regions should be
imported in tiles or from a Geofabrik extract).
Elevation (optional): Open-Meteo elevation API (Copernicus DEM GLO-90, CC BY 4.0;
free tier non-commercial only).
"""

from __future__ import annotations

import argparse
import json
import os
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from km_analytics.routing import graph as G  # noqa: E402
from km_analytics.routing.network import store  # noqa: E402

UA = "KindaMoving/2.0 (route network import; https://github.com/xndrncp08/KindaMoving)"
HIGHWAYS = "|".join(sorted(set(G.TRAVERSABLE) | set(G.ROAD_CLASS)))


MAX_BYTES = 100 * 1024 * 1024
CALGARY = (-114.6, 50.6, -113.4, 51.5)


def validated_bbox(value: str):
    try:
        w,s,e,n = (float(v) for v in value.split(','))
        if not all(math.isfinite(v) for v in (w,s,e,n)) or not (CALGARY[0]<=w<e<=CALGARY[2] and CALGARY[1]<=s<n<=CALGARY[3]):
            raise ValueError()
        if (e-w)*(n-s)>0.02:
            raise ValueError()
        return w,s,e,n
    except ValueError:
        raise ValueError("Use a finite Calgary bbox <=0.02 square degrees; import a reviewed single pilot extract, not replacement tiles") from None


def read_document(stream):
    raw=stream.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:
        raise ValueError("Network response exceeds 100 MB")
    data=json.loads(raw)
    elements=data.get('elements') if isinstance(data,dict) else None
    if not isinstance(elements,list) or not elements or len(elements)>1000000:
        raise ValueError("Expected a bounded nonempty Overpass elements list")
    for node in elements:
        if not isinstance(node,dict) or node.get('type') not in ('node','way'):
            raise ValueError("Unexpected OSM element")
        if node['type']=='node':
            lat,lon=node.get('lat'),node.get('lon')
            if not isinstance(lat,(float,int)) or not isinstance(lon,(float,int)) or not(CALGARY[1]<=lat<=CALGARY[3] and CALGARY[0]<=lon<=CALGARY[2]):
                raise ValueError("Node outside the Calgary safety envelope")
    return elements


def overpass(bbox: tuple[float, float, float, float]) -> list[dict]:
    w, s, e, n = bbox
    query = f'[out:json][timeout:170];(way["highway"~"^({HIGHWAYS})$"]({s},{w},{n},{e});)->.w;.w out body;node(w.w);out body qt;'
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": query}).encode(), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=200) as r:
        return read_document(r)


def elevations(nodes: dict[int, tuple[float, float]]) -> dict[int, float]:
    """DEM elevation per node, 100 per request. Raises if any chunk cannot be fetched:
    a partially-elevated network would make climb metrics silently wrong."""
    out, ids = {}, list(nodes)
    for i in range(0, len(ids), 100):
        chunk = ids[i : i + 100]
        q = urllib.parse.urlencode({"latitude": ",".join(f"{nodes[n][0]:.6f}" for n in chunk), "longitude": ",".join(f"{nodes[n][1]:.6f}" for n in chunk)})
        req = urllib.request.Request("https://api.open-meteo.com/v1/elevation?" + q, headers={"User-Agent": UA})
        for attempt in range(8):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    values = json.load(r)["elevation"]
                if len(values) != len(chunk):
                    raise ValueError("elevation count mismatch")
                out.update(zip(chunk, values))
                break
            except Exception as exc:
                if attempt == 7:
                    raise RuntimeError(f"Elevation fetch failed at node {i}/{len(ids)}: {exc}") from exc
                time.sleep(min(60, 2 ** (attempt + 1)))  # 429s need real backoff
        if i // 100 % 20 == 0:
            print(f"elevation {min(i + 100, len(ids))}/{len(ids)}", file=sys.stderr, flush=True)
        time.sleep(0.25)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", required=True)
    ap.add_argument("--bbox", required=True, help="west,south,east,north")
    ap.add_argument("--apply", action="store_true", help="Write to NETWORK_ADMIN_DATABASE_URL; default is dry-run")
    ap.add_argument("--replace-existing", action="store_true", help="Explicit approval to atomically replace the existing pilot region")
    ap.add_argument("--elevation", choices=["none", "open-meteo"], default="none")
    ap.add_argument("--from-file", help="Use a saved Overpass JSON response instead of downloading")
    a = ap.parse_args()
    if a.region != 'calgary':
        ap.error("This import boundary supports the reviewed calgary pilot region only")
    try:
        bbox = validated_bbox(a.bbox)
        if a.from_file:
            with open(a.from_file,'rb') as source:
                elements = read_document(source)
        else:
            elements = overpass(bbox)
    except (ValueError, OSError):
        ap.error("Invalid or unavailable network extract; no database writes occurred")
    g = G.build(elements)
    if not g.edges:
        ap.error("No traversable network; refusing an empty import")
    ele_source = None
    if a.elevation == "open-meteo":
        used = {e.u for e in g.edges} | {e.v for e in g.edges}
        ele = elevations({n: (g.nodes[n].lat, g.nodes[n].lon) for n in used})
        g = G.build(elements, ele)
        ele_source = "Copernicus DEM GLO-90 via Open-Meteo (CC BY 4.0)"
    report={"region":a.region,"bbox":bbox,"nodes":len(g.nodes),"edges":len(g.edges),"apply":a.apply}
    print(json.dumps(report))
    if not a.apply:
        return
    dsn=os.environ.get('NETWORK_ADMIN_DATABASE_URL')
    if not dsn:
        ap.error("Set NETWORK_ADMIN_DATABASE_URL securely; never pass credentials on the command line")
    try:
        print(json.dumps(store(g, a.region, bbox, dsn, ele_source, replace_existing=a.replace_existing)))
    except Exception:
        # Driver exceptions may contain connection details: keep those out of job logs.
        ap.exit(1,"Network transaction failed; no partial region was committed. Check the database privately.\n")


if __name__ == "__main__":
    main()
