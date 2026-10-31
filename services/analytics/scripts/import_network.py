"""Import a runnable network region from OpenStreetMap into PostGIS.

    python scripts/import_network.py --region calgary --bbox -114.13,51.035,-114.03,51.070 \
        --database-url "$NETWORK_ADMIN_DATABASE_URL" [--elevation open-meteo] [--from-file extract.json]

Data: (c) OpenStreetMap contributors, ODbL 1.0, via the Overpass API (identify
yourself with a User-Agent; respect its usage policy: large regions should be
imported in tiles or from a Geofabrik extract).
Elevation (optional): Open-Meteo elevation API (Copernicus DEM GLO-90, CC BY 4.0;
free tier non-commercial only).
"""

from __future__ import annotations

import argparse
import json
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


def overpass(bbox: tuple[float, float, float, float]) -> list[dict]:
    w, s, e, n = bbox
    query = f'[out:json][timeout:170];(way["highway"~"^({HIGHWAYS})$"]({s},{w},{n},{e});)->.w;.w out body;node(w.w);out body qt;'
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": query}).encode(), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=200) as r:
        return json.load(r)["elements"]


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
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--elevation", choices=["none", "open-meteo"], default="none")
    ap.add_argument("--from-file", help="Use a saved Overpass JSON response instead of downloading")
    a = ap.parse_args()
    bbox = tuple(float(v) for v in a.bbox.split(","))
    elements = json.load(open(a.from_file))["elements"] if a.from_file else overpass(bbox)
    g = G.build(elements)
    ele_source = None
    if a.elevation == "open-meteo":
        used = {e.u for e in g.edges} | {e.v for e in g.edges}
        ele = elevations({n: (g.nodes[n].lat, g.nodes[n].lon) for n in used})
        g = G.build(elements, ele)
        ele_source = "Copernicus DEM GLO-90 via Open-Meteo (CC BY 4.0)"
    print(json.dumps(store(g, a.region, bbox, a.database_url, ele_source)))


if __name__ == "__main__":
    main()
