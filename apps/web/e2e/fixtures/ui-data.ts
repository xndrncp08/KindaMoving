// Synthetic runner and observations, never a hosted account or performance claim.
export const userId = '11111111-1111-4111-8111-111111111111';
export const runId = '22222222-2222-4222-8222-222222222222';
export const shoeId = '33333333-3333-4333-8333-333333333333';
export const workoutId = '44444444-4444-4444-8444-444444444444';
export const routeId = '55555555-5555-4555-8555-555555555555';
export const date = new Date().toLocaleDateString('en-CA');
export const profile = {
  id: userId,
  preferred_name: 'Alex',
  country: 'Canada',
  city: 'Calgary',
  units: 'metric',
  experience: 'regular',
  weekly_distance_m: 40000,
  race_distance: 'half',
  goals: 'A consistent autumn training block.',
  private_profile: true,
  notifications: false,
};
export const coordinates = Array.from({ length: 61 }, (_, i) => [
  -114.0727 + Math.sin((i / 60) * Math.PI * 2) * 0.018,
  51.0532 + (Math.cos((i / 60) * Math.PI * 2) - 1) * 0.009,
]);
export const activities = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - i * 2);
  return {
    id:
      i === 0
        ? runId
        : `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
    user_id: userId,
    title: [
      'River pathway easy run',
      'Evening loop',
      'Steady run along the Bow',
    ][i % 3],
    started_at: d.toISOString().slice(0, 10),
    start_time: d.toISOString(),
    utc_offset_s: -25200,
    created_at: d.toISOString(),
    distance_m: 6000,
    elapsed_s: 1960 + i * 10,
    moving_s: 1920 + i * 10,
    source: 'file',
    sport: 'running',
    shoe_id: shoeId,
    elevation_gain_m: 42,
    elevation_loss_m: 43,
    avg_hr: 146,
    max_hr: 165,
    avg_cadence: 172,
    track: { type: 'LineString', coordinates },
    metrics: {
      pace_s_per_km: 320,
      grade_adjusted_pace_s_per_km: 316,
      stoppage_count: 2,
      distance_source: 'gps',
      pace_cv: 0.024,
      classification: {
        kind: 'easy',
        basis: 'Steady pace and moderate heart rate.',
      },
      split_type: {
        kind: 'negative',
        difference_pct: -2.4,
        first_half_s: 972,
        second_half_s: 948,
      },
      decoupling: { decoupling_pct: 2.1, ef_first: 1.3, ef_second: 1.27 },
      best_efforts: {
        '1k': { elapsed_s: 305, start_m: 4000 },
        '5k': { elapsed_s: 1590, start_m: 1000 },
      },
      warnings: [],
    },
  };
});
export const shoes = [
  {
    id: shoeId,
    user_id: userId,
    title: 'Daily trainers',
    brand: 'Saucony',
    initial_distance_m: 120000,
    retired: false,
    is_default: true,
    target_distance_m: 700000,
    purchase_price: 180,
    currency: 'CAD',
    purchased_on: '2026-08-01',
    retired_on: null,
    created_at: date,
  },
];
export const workouts = [
  {
    id: workoutId,
    user_id: userId,
    title: 'Easy run · 8 km',
    scheduled_on: date,
    description:
      'Keep it conversational. Finish feeling like you could do more.',
    completed: false,
    status: 'planned',
    kind: 'easy',
    planned_distance_m: 8000,
    activity_id: null,
    route_id: null,
    compliance: null,
    moved_from: null,
    steps: [],
    created_at: date,
  },
];
export const routes = [
  {
    id: routeId,
    user_id: userId,
    title: 'Bow River loop',
    distance_m: 6000,
    description: 'River pathways, starting at Eau Claire.',
    path: { type: 'LineString', coordinates },
    created_at: date,
    waypoints: [],
  },
];
export const splits = Array.from({ length: 6 }, (_, i) => ({
  kind: 'km',
  index: i,
  distance_m: 1000,
  elapsed_s: 325 - i * 2,
  moving_s: 325 - i * 2,
  pace_s_per_km: 325 - i * 2,
  avg_hr: 143 + i,
  elevation_gain_m: 7,
}));
export const streams = {
  point_count: 61,
  data: {
    t: coordinates.map((_, i) => i * 30),
    dist: coordinates.map((_, i) => i * 100),
    lat: coordinates.map((p) => p[1]),
    lon: coordinates.map((p) => p[0]),
    ele: coordinates.map((_, i) => 1040 + Math.sin(i / 6) * 8),
    hr: coordinates.map((_, i) => 142 + Math.round(i / 8)),
    cad: coordinates.map(() => 172),
    moving: coordinates.map(() => true),
  },
};
export const responses: Record<string, unknown> = {
  profile,
  activities,
  shoes,
  workouts,
  routes,
  'saved-routes': [],
  jobs: [],
  summary: {
    count: activities.length,
    distance_m: 72000,
    weekly_distance_m: 18000,
    shoes: { [shoeId]: 192000 },
  },
  [`analytics/explain/${runId}`]: {
    status: 'insufficient_history',
    message: 'More comparable runs are needed for context.',
  },
  [`activity-streams/${runId}`]: streams,
  [`activity-splits/${runId}`]: splits,
  coros: { status: 'disconnected' },
  conditions: {
    assessments: [],
    note: 'No current reports. This does not mean the route is clear.',
  },
  'training/overview': {
    workouts,
    runs: [],
    changes: [],
    paces: {
      basis: 'your recent 5 km effort',
      zones: {
        easy: [350, 390],
        marathon: [330, 345],
        threshold: [305, 320],
        interval: [280, 300],
      },
      predictions: { '5k': 1590, '10k': 3310, half: 7300 },
    },
  },
  gear: {
    shoes: [
      {
        ...shoes[0],
        total_m: 192000,
        runs: 12,
        last_used: date,
        target_m: 700000,
        wear_fraction: 192 / 700,
        cost_per_km: 0.94,
        weekly_rate_m: 24000,
        projected_target_on: null,
        by_kind: null,
        monthly: null,
      },
    ],
    rotation_30d: { [shoeId]: 72000 },
    unassigned_runs_90d: 0,
    unassigned: [],
  },
  [`gear/${shoeId}/wear`]: [],
  [`routes/${routeId}/conditions`]: {
    status: 'no_current_reports',
    assessments: [],
    note: 'No current reports. This does not mean the route is clear.',
    checked_at: new Date().toISOString(),
  },
  form: [],
  ghost: {
    status: 'ok',
    reference_line: { coordinates },
    frames: coordinates.map((p, i) => ({
      t: i * 5,
      ref: p,
      ghost: coordinates[Math.max(0, i - 1)],
      ahead_m: i * 2,
    })),
    gaps: coordinates.map((_, i) => ({ s: i * 100, gap_s: i / 2 })),
    finish: { gap_s: 30, ref_s: 1920, ghost_s: 1950 },
    comparability: { matched_fraction: 1 },
    splits: splits.map((s, i) => ({
      km: i + 1,
      ref_s: s.moving_s,
      ghost_s: s.moving_s + 5,
      delta_s: 5,
    })),
  },
};
