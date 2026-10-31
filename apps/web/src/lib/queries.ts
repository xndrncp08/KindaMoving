'use client';
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Resource, RecordsByResource, Profile } from '@km/types';
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
    onSuccess: () => client.invalidateQueries({ queryKey: keys.user(id) }),
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
