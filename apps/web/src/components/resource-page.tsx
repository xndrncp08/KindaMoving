'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Bookmark, Pencil, Trash2 } from 'lucide-react';
import type { Resource } from '@km/types';
import {
  Button,
  Input,
  Dialog,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@km/ui';
import {
  recordsQuery,
  profileQuery,
  savedQuery,
  api,
  keys,
  useRecordMutation,
  summaryQuery,
} from '@/lib/queries';
import { day, distance, duration, pace } from '@/lib/metrics';
import { RecordForm } from './record-form';
import { useComparison, usePreferences, useInteraction } from '@/lib/stores';
import { toast } from 'sonner';
import { UploadForm } from './upload-form';
const meta = {
  activities: [
    'Runs',
    'Every run you have imported or logged, newest first.',
    'activity',
    'Review',
  ],
  routes: [
    'Routes',
    'Generated and saved routes on the mapped network.',
    'route',
    'Plan',
  ],
  shoes: [
    'Gear',
    'Shoes in rotation and the distance on each pair.',
    'pair of shoes',
    'Equip',
  ],
  workouts: [
    'Training',
    'Your week, your workouts and how they went.',
    'workout',
    'Plan',
  ],
} as const;
const mondayOf = (d: Date) => {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m.toLocaleDateString('en-CA');
};
const sourceLabel: Record<string, string> = {
  manual: 'Manual entry',
  file: 'Imported file',
  coros: 'COROS',
};
const detailPath = {
  activities: 'activities',
  routes: 'routes',
  shoes: 'gear',
  workouts: 'training',
};
export function ResourcePage({
  name,
  userId,
  intro,
}: {
  name: Resource;
  userId: string;
  /** Module-specific content shown between the page head and the list. */
  intro?: React.ReactNode;
}) {
  const query = useQuery(recordsQuery(userId, name));
  const summary = useQuery(summaryQuery(userId));
  const shoes = useQuery(recordsQuery(userId, 'shoes'));
  const activities = useQuery(recordsQuery(userId, 'activities'));
  const profile = useQuery(profileQuery(userId));
  const saved = useQuery(savedQuery(userId));
  const router = useRouter();
  const search = useSearchParams();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const dialog = useInteraction((s) => s.dialog);
  const open = useInteraction((s) => s.open);
  const compact = usePreferences((s) => s.compact);
  const comparisons = useComparison((s) => s.ids);
  const toggle = useComparison((s) => s.toggle);
  const client = useQueryClient();
  const mutation = useRecordMutation(userId, name);
  const save = useMutation({
    mutationFn: ({ id, remove }: { id: string; remove: boolean }) =>
      api('saved-routes' + (remove ? '?id=' + id : ''), {
        method: remove ? 'DELETE' : 'POST',
        body: remove ? undefined : JSON.stringify({ route_id: id }),
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: keys.resource(userId, 'saved-routes'),
      }),
  });
  const [title, subtitle, singular, group] = meta[name];
  const term = search.get('q') || '';
  const status = search.get('status') || 'all';
  const week = search.get('week') || mondayOf(new Date());
  const start = new Date(week + 'T12:00:00');
  const validWeek = Number.isNaN(start.getTime()) ? new Date() : start;
  function filter(key: string, value: string) {
    const params = new URLSearchParams(search);
    params.set(key, value);
    router.replace('?' + params.toString(), { scroll: false });
  }
  const all = (query.data || []) as unknown as Record<string, unknown>[];
  const records = all.filter(
    (r) =>
      String(r.title).toLowerCase().includes(term.toLowerCase()) &&
      (status !== 'saved' || saved.data?.some((s) => s.route_id === r.id)) &&
      (status !== 'completed' || r.completed) &&
      (status !== 'planned' || !r.completed) &&
      (status !== 'retired' || r.retired) &&
      (status !== 'active' || !r.retired),
  );
  return (
    <div className="stack">
      <header className="page-head row between">
        <div>
          <p className="eyebrow">{group}</p>
          <h1 className="page-title">{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="row">
          {name === 'routes' && (
            <Button asChild variant="outline">
              <Link href="/app/routes/plan">Plan a route</Link>
            </Button>
          )}
          <Button
            onClick={() => {
              setEditing(null);
              open('record');
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {name === 'activities' ? 'Log Manually' : `Add ${singular}`}
          </Button>
        </div>
      </header>
      {intro}
      {name === 'activities' && <UploadForm userId={userId} />}
      <div className="row">
        <label style={{ flex: 1 }}>
          Search {title.toLowerCase()}
          <Input
            type="search"
            name="q"
            autoComplete="off"
            value={term}
            onChange={(e) => filter('q', e.target.value)}
            placeholder={
              name === 'activities'
                ? 'e.g. Running · Oct 23…'
                : 'Search by name…'
            }
          />
        </label>
        {name !== 'activities' && (
          <label>
            Show
            <select
              value={status}
              onChange={(e) => filter('status', e.target.value)}
            >
              <option value="all">All</option>
              {(name === 'routes'
                ? ['saved']
                : name === 'shoes'
                  ? ['active', 'retired']
                  : ['planned', 'completed']
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {query.isPending ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          {name === 'workouts' && (
            <Card>
              <div className="row between">
                <h2>Your week</h2>
                <label>
                  Week starting
                  <Input
                    type="date"
                    value={week}
                    onChange={(e) => filter('week', e.target.value)}
                  />
                </label>
              </div>
              <div className="calendar">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(validWeek);
                  d.setDate(d.getDate() + i);
                  const key = d.toLocaleDateString('en-CA');
                  return (
                    <div className="day" key={key}>
                      <p className="eyebrow">
                        {d.toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      {all
                        .filter((w) => w.scheduled_on === key)
                        .map((w) => (
                          <Link
                            key={String(w.id)}
                            href={'/app/training/' + w.id}
                          >
                            {w.completed ? '✓ ' : ''}
                            {String(w.title)}
                          </Link>
                        ))}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          {all.length >= 500 && (
            <p className="notice">
              Showing the 500 most recent records. Totals include all
              activities.
            </p>
          )}
          {records.length === 0 ? (
            <EmptyState
              title={term ? 'Nothing matches.' : 'Your next chapter is blank.'}
            >
              Add your first {singular}. No heroic effort required.
            </EmptyState>
          ) : name === 'activities' ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="hide-sm">Run</th>
                    <th className="n">Distance</th>
                    <th className="n hide-sm">Moving</th>
                    <th className="n">Pace</th>
                    <th className="hide-sm">Source</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const time = Number(r.moving_s ?? r.elapsed_s);
                    const imperial = profile.data?.units === 'imperial';
                    const p = pace(Number(r.distance_m), time);
                    return (
                      <tr key={String(r.id)}>
                        <td suppressHydrationWarning>
                          <Link href={'/app/activities/' + r.id}>
                            {day(String(r.started_at), {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </Link>
                        </td>
                        <td className="truncate-cell hide-sm">
                          {String(r.title)}
                        </td>
                        <td className="n">
                          {distance(Number(r.distance_m), profile.data?.units)}
                        </td>
                        <td className="n hide-sm">{duration(time)}</td>
                        <td className="n">
                          {p
                            ? `${duration(p * (imperial ? 1.609344 : 1))} /${imperial ? 'mi' : 'km'}`
                            : '—'}
                        </td>
                        <td className="hide-sm">
                          {!compact && (
                            <span className="badge quiet">
                              {sourceLabel[String(r.source ?? 'manual')]}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <label className="compare-toggle">
                              <input
                                type="checkbox"
                                checked={comparisons.includes(String(r.id))}
                                onChange={() => toggle(String(r.id))}
                              />
                              <span className="hide-sm">Compare</span>
                              <span className="sr-only">
                                {' '}
                                {String(r.title)}
                              </span>
                            </label>
                            <Button
                              variant="ghost"
                              className="button-icon"
                              aria-label={`Edit ${String(r.title)}`}
                              onClick={() => {
                                setEditing(r);
                                open('record');
                              }}
                            >
                              <Pencil size={16} aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              className="button-icon danger-icon"
                              aria-label={`Delete ${String(r.title)}`}
                              onClick={() => {
                                setEditing(r);
                                open('delete');
                              }}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid two">
              {records.map((r) => (
                <Card key={String(r.id)}>
                  <p className="eyebrow muted">
                    {name === 'shoes'
                      ? r.retired
                        ? 'Retired'
                        : 'In rotation'
                      : name === 'workouts'
                        ? r.completed
                          ? 'Completed'
                          : 'Planned'
                        : 'Your route'}
                  </p>
                  <h2>
                    <Link href={'/app/' + detailPath[name] + '/' + r.id}>
                      {String(r.title)}
                    </Link>
                  </h2>
                  {name === 'shoes' ? (
                    <>
                      <p>{String(r.brand)}</p>
                      <p className="metric">
                        {summary.data
                          ? distance(
                              summary.data.shoes[String(r.id)] || 0,
                              profile.data?.units,
                            )
                          : '—'}
                      </p>
                    </>
                  ) : name === 'routes' ? (
                    <>
                      <p>
                        {distance(Number(r.distance_m), profile.data?.units)}
                      </p>
                      <p className="muted">{String(r.description)}</p>
                    </>
                  ) : (
                    <>
                      <p suppressHydrationWarning>
                        {day(String(r.scheduled_on), {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <p className="muted">{String(r.description)}</p>
                    </>
                  )}
                  <div className="row">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(r);
                        open('record');
                      }}
                    >
                      Edit
                    </Button>
                    {name === 'routes' && (
                      <Button
                        variant="ghost"
                        disabled={save.isPending}
                        onClick={() =>
                          save.mutate(
                            {
                              id: String(r.id),
                              remove: !!saved.data?.some(
                                (s) => s.route_id === r.id,
                              ),
                            },
                            { onError: (e) => toast.error(e.message) },
                          )
                        }
                      >
                        <Bookmark size={15} />
                        {saved.data?.some((s) => s.route_id === r.id)
                          ? 'Unsave'
                          : 'Save route'}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setEditing(r);
                        open('delete');
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {name === 'activities' && comparisons.length > 0 && (
        <Card>
          <h2>Selected activities</h2>
          <p className="muted">
            Basic comparison · up to four runs
            {comparisons.length === 2 && (
              <>
                {' · '}
                <Link
                  href={`/app/activities/compare?a=${comparisons[0]}&b=${comparisons[1]}`}
                >
                  Detailed comparison ↗
                </Link>
              </>
            )}
          </p>
          <div className="grid">
            {activities.data
              ?.filter((a) => comparisons.includes(a.id))
              .map((a) => (
                <div key={a.id}>
                  <h3>{a.title}</h3>
                  <p>
                    {distance(a.distance_m, profile.data?.units)} ·{' '}
                    {duration(a.elapsed_s)}
                  </p>
                </div>
              ))}
          </div>
        </Card>
      )}
      <Dialog
        title={editing ? 'Edit ' + singular : 'Add ' + singular}
        description="Stored privately in your account."
        open={dialog === 'record'}
        onOpenChange={(v) => {
          if (!v && confirm('Close this form? Unsaved changes will be lost.'))
            open(null);
        }}
      >
        <RecordForm
          key={String(editing?.id || 'new')}
          name={name}
          userId={userId}
          record={editing || undefined}
          shoes={shoes.data || []}
          onSaved={() => open(null)}
        />
      </Dialog>
      <Dialog
        title="Delete this record?"
        description="This permanently removes the record and its linked child records. Shoe deletion is blocked while assigned to activities."
        open={dialog === 'delete'}
        onOpenChange={(v) => !v && open(null)}
      >
        {mutation.error && <ErrorState message={mutation.error.message} />}
        <Button
          variant="destructive"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              { method: 'DELETE', recordId: String(editing?.id) },
              {
                onSuccess: () => {
                  open(null);
                  toast.success('Record deleted.');
                },
              },
            )
          }
        >
          Permanently delete
        </Button>
      </Dialog>
    </div>
  );
}
