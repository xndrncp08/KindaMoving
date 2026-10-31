'use client';
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  Resource,
  RecordsByResource,
  Profile,
  Job,
  ActivityStreams,
} from '@km/types';
import { isActive } from './sync';
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const keys = {
  user: (id: string) => ['user', id] as const,
  resource: (id: string, name: string) => ['user', id, name] as const,
};
export function recordsQuery<R extends Resource>(id: string, name: R) {
  return queryOptions({
    queryKey: keys.resource(id, name),
    queryFn: () => api<RecordsByResource[R][]>(name),
  });
}
export function profileQuery(id: string) {
  return queryOptions({
    queryKey: keys.resource(id, 'profile'),
    queryFn: () => api<Profile | null>('profile'),
  });
}
export function savedQuery(id: string) {
  return queryOptions({
    queryKey: keys.resource(id, 'saved-routes'),
    queryFn: () => api<{ route_id: string }[]>('saved-routes'),
  });
}
/** Invalidate the user's related summaries after a confirmed write. No invented optimistic IDs. */
export function useRecordMutation(id: string, name: Resource) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      method,
      data,
      recordId,
    }: {
      method: 'POST' | 'PATCH' | 'DELETE';
      data?: unknown;
      recordId?: string;
    }) =>
      api(name + (method === 'DELETE' ? '?id=' + recordId : ''), {
        method,
        body: method === 'DELETE' ? undefined : JSON.stringify(data),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.user(id) }), // includes gear analytics, summaries and training
  });
}

export interface RunningSummary {
  count: number;
  distance_m: number;
  weekly_distance_m: number;
  shoes: Record<string, number>;
}
export function summaryQuery(id: string) {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = monday.toLocaleDateString('en-CA');
  return queryOptions({
    queryKey: [...keys.resource(id, 'summary'), week],
    queryFn: () => api<RunningSummary>('summary?week=' + week),
  });
}
export function detailQuery<R extends Resource>(
  userId: string,
  name: R,
  id: string,
) {
  return queryOptions({
    queryKey: [...keys.resource(userId, name), id],
    queryFn: () => api<RecordsByResource[R]>(name + '/' + id),
  });
}

export function jobsQuery(userId: string) {
  return queryOptions({
    queryKey: keys.resource(userId, 'jobs'),
    queryFn: () => api<Job[]>('jobs'),
    // Poll only while something is in flight; idle accounts make no requests.
    refetchInterval: (q) => (q.state.data?.some(isActive) ? 2000 : false),
    staleTime: 0,
  });
}
export function streamsQuery(userId: string, activityId: string) {
  return queryOptions({
    queryKey: [...keys.resource(userId, 'streams'), activityId],
    queryFn: () =>
      api<{ point_count: number; data: ActivityStreams }>(
        'activity-streams/' + activityId,
      ),
    staleTime: Infinity, // streams of an activity never change after import
    retry: (n, e) => n < 1 && !String(e.message).includes('not found'),
  });
}
export function useJobAction(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'retry' }) =>
      api('jobs/' + id, { method: 'POST', body: JSON.stringify({ action }) }),
    onSettled: () =>
      client.invalidateQueries({ queryKey: keys.resource(userId, 'jobs') }),
  });
}
export interface Observation {
  key: string;
  label: string;
  unit: string;
  value: number;
  typical: number;
  difference: number;
  robust_z: number | null;
  n: number;
}
export interface Explanation {
  status: 'ok' | 'insufficient_history' | 'not_applicable';
  message?: string;
  method?: string;
  comparables?: {
    id: string;
    title: string;
    start_time: string;
    distance_m: number;
    same_route: boolean;
  }[];
  measured?: Observation[];
  modeled?: Observation[];
  context?: Observation[];
  possible_explanations?: { text: string; evidence: string[] }[];
}
export function explainQuery(userId: string, activityId: string) {
  return queryOptions({
    queryKey: [...keys.resource(userId, 'analytics'), 'explain', activityId],
    queryFn: () => api<Explanation>('analytics/explain/' + activityId),
    retry: false,
  });
}
export function overviewQuery(userId: string) {
  const today = new Date().toLocaleDateString('en-CA');
  return queryOptions({
    queryKey: [...keys.resource(userId, 'analytics'), 'overview', today],
    queryFn: () =>
      api<import('./analytics').Overview>('analytics/overview?today=' + today),
  });
}
export type { Assessment } from './conditions';
/** Rounded to ~1 km so panning slightly reuses the cached overlay. */
export function conditionsQuery(
  userId: string,
  lat: number,
  lon: number,
  radius = 4000,
) {
  const la = Math.round(lat * 100) / 100;
  const lo = Math.round(lon * 100) / 100;
  return queryOptions({
    queryKey: [...keys.resource(userId, 'conditions'), 'near', la, lo, radius],
    queryFn: () =>
      api<{ assessments: import('./conditions').Assessment[]; note: string }>(
        `conditions?lat=${la}&lon=${lo}&radius=${radius}`,
      ),
    refetchInterval: 120000, // conditions are time-sensitive; refresh while visible
  });
}
export function routeConditionsQuery(userId: string, routeId: string) {
  return queryOptions({
    queryKey: [...keys.resource(userId, 'conditions'), 'route', routeId],
    queryFn: () =>
      api<{
        status: 'caution' | 'check' | 'no_current_reports' | 'no_geometry';
        assessments: import('./conditions').Assessment[];
        note: string;
        checked_at: string;
      }>(`routes/${routeId}/conditions`),
    refetchInterval: 120000,
  });
}
export interface TrainingOverview {
  workouts: {
    id: string;
    title: string;
    scheduled_on: string;
    kind: string;
    status: 'planned' | 'completed' | 'missed' | 'skipped';
    planned_distance_m: number | null;
    activity_id: string | null;
    route_id: string | null;
    compliance: { grade?: string; ratio?: number; reason?: string } | null;
    moved_from: string | null;
    steps: import('./training/steps').Step[];
    description: string;
  }[];
  runs: { id: string; started_at: string; distance_m: number }[];
  changes: import('./training/reconcile').Change[];
  paces: import('./training/paces').Paces;
}
const isoDay = (d: Date) => d.toLocaleDateString('en-CA');
export function trainingQuery(userId: string, weekStart: string) {
  const today = isoDay(new Date());
  const end = new Date(weekStart + 'T12:00:00');
  end.setDate(end.getDate() + 6);
  return queryOptions({
    queryKey: [...keys.resource(userId, 'training'), weekStart, today],
    queryFn: () =>
      api<TrainingOverview>(
        `training/overview?from=${weekStart}&to=${isoDay(end)}&today=${today}`,
      ),
  });
}
export interface GearShoe {
  id: string;
  title: string;
  brand: string;
  retired: boolean;
  retired_on: string | null;
  is_default: boolean;
  total_m: number;
  runs: number;
  last_used: string | null;
  target_m: number;
  wear_fraction: number;
  cost_per_km: number | null;
  currency: string;
  weekly_rate_m: number;
  projected_target_on: string | null;
  by_kind: Record<
    string,
    {
      m: number;
      runs: number;
      pace_s_per_km: number | null;
      avg_hr: number | null;
    }
  > | null;
  monthly: { month: string; m: number }[] | null;
}
export function gearQuery(userId: string) {
  const today = new Date().toLocaleDateString('en-CA');
  return queryOptions({
    queryKey: [...keys.resource(userId, 'gear-analytics'), today],
    queryFn: () =>
      api<{
        shoes: GearShoe[];
        rotation_30d: Record<string, number>;
        unassigned_runs_90d: number;
        unassigned: {
          id: string;
          title: string;
          started_at: string;
          distance_m: number;
        }[];
      }>('gear?today=' + today),
  });
}
