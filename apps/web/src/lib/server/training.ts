import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { paces } from '../training/paces';
import { generatePlan } from '../training/plan';

export const planRequest = z.object({
  race: z.enum(['5k', '10k', 'half', 'marathon']),
  race_date: z.iso.date(),
  run_days: z.array(z.number().int().min(0).max(6)).min(3).max(6),
  long_run_day: z.number().int().min(0).max(6),
  experience: z.enum(['new', 'regular', 'experienced']).optional(),
  today: z.iso.date(),
});
const FALLBACK_10K = { new: 4200, regular: 3300, experienced: 2700 } as const;

/** Inputs measured from the athlete's own records: 4-week average volume and best efforts. */
export async function trainingContext(
  db: SupabaseClient,
  userId: string,
  today: string,
) {
  const since = new Date(Date.parse(today) - 28 * 86400000)
    .toISOString()
    .slice(0, 10);
  const yearAgo = new Date(Date.parse(today) - 365 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [recent, efforts, profile] = await Promise.all([
    db
      .from('activities')
      .select('distance_m')
      .eq('user_id', userId)
      .gte('started_at', since)
      .lte('started_at', today),
    db
      .from('activities')
      .select('best_efforts:metrics->best_efforts')
      .eq('user_id', userId)
      .gte('started_at', yearAgo)
      .not('start_time', 'is', null)
      .limit(1000),
    db
      .from('profiles')
      .select('experience,weekly_distance_m')
      .eq('id', userId)
      .maybeSingle(),
  ]);
  const four =
    (recent.data ?? []).reduce((s, r) => s + Number(r.distance_m), 0) / 4;
  const sizes: Record<string, number> = {
    '5k': 5000,
    '10k': 10000,
    half: 21097.5,
    marathon: 42195,
  };
  const list = (efforts.data ?? []).flatMap((r) =>
    Object.entries(
      (r.best_efforts as Record<string, { elapsed_s: number }> | null) ?? {},
    )
      .filter(([k]) => k in sizes)
      .map(([k, v]) => ({ distance_m: sizes[k], elapsed_s: v.elapsed_s })),
  );
  const experience = (profile.data?.experience ??
    'regular') as keyof typeof FALLBACK_10K;
  return {
    experience,
    // Measured volume wins; the onboarding estimate is used only when there are no runs yet.
    current_weekly_m:
      four > 0
        ? Math.round(four)
        : Number(profile.data?.weekly_distance_m ?? 0),
    volume_basis:
      four > 0
        ? 'your last 4 weeks of logged runs'
        : 'your onboarding estimate (no runs logged in 4 weeks)',
    paces: paces(list, FALLBACK_10K[experience]),
  };
}

export function nextMonday(today: string) {
  const t = Date.parse(today + 'T00:00:00Z');
  const day = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t + ((7 - day) % 7 || 7) * 86400000)
    .toISOString()
    .slice(0, 10);
}

export async function buildPlan(
  db: SupabaseClient,
  userId: string,
  req: z.infer<typeof planRequest>,
) {
  const ctx = await trainingContext(db, userId, req.today);
  const experience = req.experience ?? ctx.experience;
  const start = nextMonday(req.today);
  const plan = generatePlan({
    ...req,
    start_date: start,
    current_weekly_m: ctx.current_weekly_m,
    experience,
    paces: ctx.paces,
  });
  return {
    ...plan,
    start_date: start,
    experience,
    paces: ctx.paces,
    volume_basis: ctx.volume_basis,
    current_weekly_m: ctx.current_weekly_m,
  };
}
