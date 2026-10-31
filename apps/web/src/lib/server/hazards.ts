import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  void db;
  void lat;
  void lon;
  void radiusM;
  return []; // replaced by the conditions confidence model (feat/route-conditions)
}
