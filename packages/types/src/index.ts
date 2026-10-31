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
export const shoeSchema = z.object({
  title,
  brand: z.string().trim().max(80),
  initial_distance_m: z.coerce.number().nonnegative().max(10000000).default(0),
  retired: z.boolean().default(false),
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
export type Activity = z.infer<typeof activitySchema> & {
  id: string;
  user_id: string;
};
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
export interface SyncJob extends OwnedRecord {
  account_id: string | null;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  error_code: string | null;
}
export interface ActivityUpload extends OwnedRecord {
  filename: string;
  format: 'gpx' | 'fit';
  size_bytes: number;
  object_path: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
}
export interface UserPreferences {
  id: string;
  units: 'metric' | 'imperial';
  private_profile: boolean;
  notifications: boolean;
}
