import { z } from 'zod';
const title = z.string().trim().min(1).max(120);
const date = z.iso.date();
const uuid = z.uuid();
export const activitySchema = z.object({
  title,
  started_at: date,
  distance_m: z.coerce.number().positive().max(500000),
  elapsed_s: z.coerce.number().int().positive().max(604800),
  shoe_id: uuid.nullable().default(null),
});
export const routeSchema = z.object({
  title,
  description: z.string().trim().max(2000).default(''),
  distance_m: z.coerce.number().nonnegative().max(500000).default(0),
});
const optionalNumber = (max: number) =>
  z.preprocess(
    (v) =>
      v === '' || v === null || v === undefined || Number.isNaN(v) ? null : v,
    z.coerce.number().nonnegative().max(max).nullable(),
  );
const optionalDate = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  date.nullable(),
);
export const shoeSchema = z.object({
  title,
  brand: z.string().trim().max(80),
  initial_distance_m: z.coerce.number().nonnegative().max(10000000).default(0),
  retired: z.boolean().default(false),
  purchase_price: optionalNumber(10000).default(null),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('CAD'),
  purchased_on: optionalDate.default(null),
  retired_on: optionalDate.default(null),
  target_distance_m: z.coerce.number().min(100000).max(3000000).default(700000),
  is_default: z.boolean().default(false),
});
export const workoutSchema = z.object({
  title,
  scheduled_on: date,
  description: z.string().trim().max(2000).default(''),
  completed: z.boolean().default(false),
});
export const profileSchema = z.object({
  preferred_name: title,
  country: z.string().trim().max(80),
  city: z.string().trim().max(100),
  units: z.enum(['metric', 'imperial']),
  experience: z.enum(['new', 'regular', 'experienced']),
  weekly_distance_m: z.coerce.number().nonnegative().max(500000),
  race_distance: z.enum(['5k', '10k', 'half', 'marathon', 'other']),
  goals: z.string().trim().max(2000),
  private_profile: z.boolean(),
  notifications: z.boolean(),
});
export const resourceSchemas = {
  activities: activitySchema,
  routes: routeSchema,
  shoes: shoeSchema,
  workouts: workoutSchema,
};
export type Resource = keyof typeof resourceSchemas;
export type ActivitySource = 'manual' | 'file' | 'coros';
export type Activity = z.infer<typeof activitySchema> & {
  id: string;
  user_id: string;
  start_time?: string | null;
  utc_offset_s?: number | null;
  moving_s?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  avg_cadence?: number | null;
  sport?: string;
  source?: ActivitySource;
  source_ref?: string | null;
  device?: Record<string, unknown>;
  metrics?: ActivityMetrics;
  weather?: Record<string, unknown> | null;
  track?: { type: 'LineString'; coordinates: [number, number][] } | null;
};
export interface Split {
  index: number;
  distance_m: number;
  elapsed_s: number;
  moving_s: number;
  pace_s_per_km: number | null;
  avg_hr: number | null;
  elevation_gain_m?: number | null;
}
/** Output of the analytics service (km-analytics/1), stored in activities.metrics. */
export interface ActivityMetrics {
  pace_s_per_km?: number | null;
  grade_adjusted_pace_s_per_km?: number | null;
  stoppage_count?: number;
  stopped_s?: number;
  pace_cv?: number | null;
  split_type?: {
    kind: 'even' | 'positive' | 'negative';
    first_half_s: number;
    second_half_s: number;
    difference_pct: number;
  } | null;
  decoupling?: {
    ef_first: number;
    ef_second: number;
    decoupling_pct: number;
  } | null;
  best_efforts?: Record<string, { elapsed_s: number; start_m: number }>;
  classification?: { kind: string; basis: string };
  stoppages?: {
    start_offset_s: number;
    duration_s: number;
    at_distance_m: number;
    lat: number | null;
    lon: number | null;
  }[];
  quality?: Record<string, number | null>;
  warnings?: string[];
  distance_source?: 'gps' | 'device';
  timezone_assumed?: boolean;
  crosses_midnight?: boolean;
}
export interface ActivityStreams {
  t: number[];
  dist: number[];
  lat: (number | null)[];
  lon: (number | null)[];
  ele: (number | null)[];
  hr: (number | null)[];
  cad: (number | null)[];
  moving: boolean[];
}
export type JobStatus =
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  progress: Record<string, unknown>;
  result: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  run_after: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}
export type Route = z.infer<typeof routeSchema> & {
  id: string;
  user_id: string;
  path?: unknown;
};
export type Shoe = z.infer<typeof shoeSchema> & { id: string; user_id: string };
export type Workout = z.infer<typeof workoutSchema> & {
  id: string;
  user_id: string;
};
export type Profile = z.infer<typeof profileSchema> & { id: string };
export interface RecordsByResource {
  activities: Activity;
  routes: Route;
  shoes: Shoe;
  workouts: Workout;
}
/** All distances are metres, all durations seconds. Never encode display units in storage. */
export interface ActivityIngestion {
  submit(file: File): Promise<{ id: string; status: 'pending' }>;
}
export interface WearableProvider {
  readonly provider: 'coros';
  connect(): Promise<{ authorizationUrl: string }>;
  sync(accountId: string): Promise<{ jobId: string }>;
}
export interface RoutingService {
  route(input: {
    start: [number, number];
    end: [number, number];
  }): Promise<{ geometry: unknown; distance_m: number }>;
}
export interface ConditionsService {
  reports(
    routeId: string,
  ): Promise<{ observedAt: string; description: string }[]>;
}
export interface AnalyticsService {
  summarize(
    activityId: string,
  ): Promise<{ version: string; metrics: Record<string, number> }>;
}
export interface TrainingService {
  recommend(userId: string): Promise<{ workoutIds: string[] }>;
}

export interface OwnedRecord {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}
export interface ActivitySplit extends OwnedRecord {
  activity_id: string;
  split_index: number;
  distance_m: number;
  elapsed_s: number;
}
export interface SavedRoute extends OwnedRecord {
  route_id: string;
}
export interface ShoeAssignment extends OwnedRecord {
  activity_id: string;
  shoe_id: string;
}
export interface TrainingPlan extends OwnedRecord {
  title: string;
  starts_on: string;
  ends_on: string;
  goal: string;
}
export interface RouteConditionReport extends OwnedRecord {
  route_id: string;
  observed_at: string;
  description: string;
  location: unknown | null;
}
export interface ConnectedProviderAccount extends OwnedRecord {
  provider: 'coros';
  status: 'disconnected' | 'connected' | 'error';
}
export interface ActivityUpload extends OwnedRecord {
  filename: string;
  format: 'gpx' | 'fit';
  size_bytes: number;
  object_path: string;
  status: 'pending' | 'processing' | 'complete' | 'duplicate' | 'failed';
  sha256: string | null;
  activity_id: string | null;
  error: string | null;
}
export interface UserPreferences {
  id: string;
  units: 'metric' | 'imperial';
  private_profile: boolean;
  notifications: boolean;
}
