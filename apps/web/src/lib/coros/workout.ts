import type { Step } from '../training/steps';
import { flatten } from '../training/steps';
/**
 * KindaMoving -> COROS workout `course`. The COROS tool guide documents the tool and its
 * limits (running sport code 1, dates today..+90 days) but not the nested `course`
 * fields, so this mapping is UNVERIFIED until checked against a live connection. Every
 * push is validated against the live inputSchema first and refused on mismatch.
 */
export function toCourse(w: {
  title: string;
  description: string;
  steps: Step[];
}) {
  return {
    name: w.title.slice(0, 60),
    sportType: 1,
    description: w.description.slice(0, 500),
    sections: flatten(w.steps).map((s, i) => ({
      index: i + 1,
      sectionType: s.type,
      targetType: s.distance_m ? 'distance' : 'time',
      targetValue: s.distance_m ?? s.duration_s,
      intensityType: s.pace_s_per_km ? 'pace' : s.hr ? 'heartRate' : 'free',
      intensityRange: s.pace_s_per_km ?? s.hr ?? null,
    })),
  };
}
export const ymd = (d: string) => d.replace(/-/g, '');
