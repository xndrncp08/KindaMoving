/** Client-side geometry helpers (display only; authoritative distances come from PostGIS/analytics). */
const R = 6371008.8;
export function haversine(a: number[], b: number[]) {
  const [lon1, lat1] = a.map((v) => (v * Math.PI) / 180);
  const [lon2, lat2] = b.map((v) => (v * Math.PI) / 180);
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Portion of a [lon,lat] line between two distances along it, interpolating the cut points. */
export function lineSlice(coords: number[][], fromM: number, toM: number) {
  const out: number[][] = [];
  let at = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const d = haversine(a, b);
    const lerp = (m: number) => {
      const f = d > 0 ? (m - at) / d : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    if (at + d >= fromM && at <= toM) {
      if (!out.length) out.push(fromM > at ? lerp(fromM) : a);
      out.push(toM < at + d ? lerp(toM) : b);
    }
    at += d;
    if (at > toM) break;
  }
  return out;
}
export function bounds(coords: number[][]) {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  return [w, s, e, n] as [number, number, number, number];
}
