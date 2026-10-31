import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hazardWeight } from '../conditions';
import { conditionsNear } from './conditions';
/** Hazards (scored condition reports) near a point, passed to the router as cost penalties. */
export interface RouteHazard {
  lat: number;
  lon: number;
  radius_m: number;
  weight: number;
  kind: string;
  label: string;
}
export async function hazardsNear(
  db: SupabaseClient,
  lat: number,
  lon: number,
  radiusM: number,
): Promise<RouteHazard[]> {
  try {
    const assessments = await conditionsNear(db, lat, lon, radiusM);
    return assessments
      .map((a) => ({
        lat: a.lat,
        lon: a.lon,
        radius_m: 40,
        weight: hazardWeight(a),
        kind: a.kind,
        label: `${a.kind} (${a.status}, p=${a.probability})`,
      }))
      .filter((h) => h.weight > 0)
      .slice(0, 300);
  } catch {
    return []; // routing still works; the UI states how many conditions were weighed
  }
}
