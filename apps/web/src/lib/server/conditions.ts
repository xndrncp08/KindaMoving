import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assessAll, type Env, type NearReport } from '../conditions';

interface Hourly {
  time: string[];
  temperature_2m: (number | null)[];
  precipitation: (number | null)[];
  snowfall: (number | null)[];
}
const cache = new Map<string, { at: number; hourly: Hourly | null }>();
/**
 * Weather since an observation near a point (Open-Meteo, ~10 km cell, cached 30 min):
 * max temperature, precipitation and snowfall feed the half-life adjustments.
 * Failure degrades to unadjusted half-lives.
 */
async function weatherSince(
  lat: number,
  lon: number,
  since: Date,
): Promise<Env> {
  if (process.env.WEATHER_DISABLED === 'true') return {};
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > 1800000) {
    let hourly: Hourly | null = null;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}&hourly=temperature_2m,precipitation,snowfall&past_days=3&forecast_days=1&timezone=GMT`;
      const r = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
      });
      hourly = r.ok ? ((await r.json()).hourly as Hourly) : null;
    } catch {
      hourly = null;
    }
    hit = { at: Date.now(), hourly };
    cache.set(key, hit);
  }
  return envBetween(hit.hourly, since, new Date());
}
/** Aggregate hourly weather over [since, until]. Exported for tests. */
export function envBetween(h: Hourly | null, since: Date, until: Date): Env {
  if (!h) return {};
  const from = since.toISOString().slice(0, 13);
  const to = until.toISOString().slice(0, 13);
  const idx = h.time.flatMap((t, i) =>
    t.slice(0, 13) >= from && t.slice(0, 13) <= to ? [i] : [],
  );
  if (!idx.length) return {};
  const temps = idx
    .map((i) => h.temperature_2m[i])
    .filter((v): v is number => typeof v === 'number');
  return {
    max_temp_c: temps.length ? Math.max(...temps) : null,
    precip_mm: idx.reduce((s, i) => s + (h.precipitation[i] ?? 0), 0),
    snowfall_cm: idx.reduce((s, i) => s + (h.snowfall[i] ?? 0), 0),
  };
}

export async function conditionsNear(
  db: SupabaseClient,
  lat: number,
  lon: number,
  radiusM: number,
) {
  const { data, error } = await db.rpc('conditions_near', {
    p_lat: lat,
    p_lon: lon,
    p_radius_m: radiusM,
  });
  if (error) throw new Error('Conditions unavailable.');
  const reports = (data ?? []) as NearReport[];
  const envs = new Map<string, Env>();
  for (const r of reports)
    envs.set(r.id, await weatherSince(r.lat, r.lon, new Date(r.observed_at)));
  return assessAll(reports, new Date(), (r) => envs.get(r.id) ?? {});
}
