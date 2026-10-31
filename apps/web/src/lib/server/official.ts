import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { zonedToUtc } from '../routes/time';
/**
 * Official City of Calgary open data (https://data.calgary.ca, Open Data Terms:
 * https://data.calgary.ca/d/Open-Data-Terms/u45n-7awa), fetched via the Socrata API:
 *   w8zq-79bq Construction Detours  (local times, America/Edmonton)
 *   4jah-h97u Current Traffic Incidents (UTC)
 */
const SOURCES = {
  detours: 'https://data.calgary.ca/resource/w8zq-79bq.json?$limit=500',
  incidents: 'https://data.calgary.ca/resource/4jah-h97u.json?$limit=500',
};
type Row = Record<string, string | undefined>;
export interface Official {
  ref: string;
  source: string;
  kind: 'closure' | 'construction' | 'obstruction';
  severity: 1 | 2 | 3;
  lat: number;
  lon: number;
  observed_at: Date;
  ends_at: Date | null;
  description: string;
}
const num = (v?: string) =>
  v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export function mapDetour(r: Row, now: Date): Official | null {
  const lat = num(r.latitude);
  const lon = num(r.longitude);
  const start = r.start_dt ? zonedToUtc(r.start_dt, 'America/Edmonton') : null;
  const end = r.end_dt ? zonedToUtc(r.end_dt, 'America/Edmonton') : null;
  if (lat === null || lon === null || !start) return null;
  if (
    (end && end.getTime() < now.getTime()) ||
    start.getTime() > now.getTime() + 86400000
  )
    return null;
  const text =
    `${r.construction_info ?? ''}: ${(r.description ?? '').replace(/[^\x20-\x7E]+/g, ' ').trim()}`.slice(
      0,
      500,
    );
  const pedestrian = /sidewalk|pathway|pedestrian|crosswalk/i.test(text);
  return {
    ref: `w8zq-79bq:${r.construction_info}:${r.start_dt}`,
    source: 'City of Calgary · Construction Detours',
    kind: pedestrian ? 'closure' : 'construction',
    severity: pedestrian ? 3 : 1,
    lat,
    lon,
    observed_at: start,
    ends_at: end,
    description: text,
  };
}
export function mapIncident(r: Row): Official | null {
  const lat = num(r.latitude);
  const lon = num(r.longitude);
  const start = r.start_dt_utc
    ? new Date(r.start_dt_utc.replace(' ', 'T'))
    : null;
  if (lat === null || lon === null || !start || Number.isNaN(start.getTime()))
    return null;
  // Incidents carry no end time; treat them as active for 3 hours after the last update.
  const modified = r.modified_dt_utc
    ? new Date(r.modified_dt_utc.replace(' ', 'T'))
    : start;
  return {
    ref: `4jah-h97u:${r.start_dt_utc}:${r.latitude}:${r.longitude}`,
    source: 'City of Calgary · Traffic Incidents',
    kind: 'obstruction',
    severity: 1,
    lat,
    lon,
    observed_at: start,
    ends_at: new Date(modified.getTime() + 3 * 3600000),
    description: `${r.incident_info ?? ''}: ${r.description ?? ''}`.slice(
      0,
      500,
    ),
  };
}
export async function importOfficial(db: SupabaseClient, now = new Date()) {
  const out = { detours: 0, incidents: 0, errors: [] as string[] };
  for (const [name, url] of Object.entries(SOURCES) as [
    keyof typeof SOURCES,
    string,
  ][]) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = (await r.json()) as Row[];
      for (const row of rows) {
        const o = name === 'detours' ? mapDetour(row, now) : mapIncident(row);
        if (!o) continue;
        const { error } = await db.rpc('upsert_official_condition', {
          p_source_name: o.source,
          p_ref: o.ref.slice(0, 300),
          p_kind: o.kind,
          p_severity: o.severity,
          p_lat: o.lat,
          p_lon: o.lon,
          p_observed_at: o.observed_at.toISOString(),
          p_ends_at: o.ends_at?.toISOString() ?? null,
          p_description: o.description,
        });
        if (!error) out[name]++;
      }
    } catch (e) {
      out.errors.push(`${name}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  return out;
}
