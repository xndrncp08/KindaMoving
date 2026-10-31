'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowUpRight, Bookmark } from 'lucide-react';
import type { Resource } from '@km/types';
import {
  Button,
  Input,
  Dialog,
  Card,
  DataTable,
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
import { distance, duration, pace } from '@/lib/metrics';
import { RecordForm } from './record-form';
import { useComparison, usePreferences, useInteraction } from '@/lib/stores';
import { toast } from 'sonner';
import { UploadForm } from './upload-form';
const meta = {
  activities: ['Activities', 'Every mile has a place.', 'activity'],
  routes: ['Routes', 'Keep the good loops close.', 'route'],
  shoes: ['Gear', 'A little sole searching.', 'pair of shoes'],
  workouts: ['Training', 'Make room for your next run.', 'workout'],
} as const;
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
}: {
  name: Resource;
  userId: string;
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
  const [title, subtitle, singular] = meta[name];
  const term = search.get('q') || '';
  const status = search.get('status') || 'all';
  const week = search.get('week') || new Date().toLocaleDateString('en-CA');
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
          <p className="eyebrow">Your running, together</p>
          <h1 className="page-title">{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            open('record');
          }}
        >
          <Plus size={16} />
          Add {singular}
        </Button>
      </header>
      <div className="row">
        <label style={{ flex: 1 }}>
          Search {title.toLowerCase()}
          <Input
            value={term}
            onChange={(e) => filter('q', e.target.value)}
            placeholder="Find a familiar name…"
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
              activities. Pagination is a Phase 2 extension.
            </p>
          )}
          {records.length === 0 ? (
            <EmptyState
              title={term ? 'Nothing matches.' : 'Your next chapter is blank.'}
            >
              Add your first {singular}. No heroic effort required.
            </EmptyState>
          ) : name === 'activities' ? (
            <DataTable
              headers={[
                'Activity',
                'Date',
                'Distance',
                'Time',
                'Pace',
                'Actions',
              ]}
            >
              {records.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    <Link href={'/app/activities/' + r.id}>
                      {String(r.title)} <ArrowUpRight size={12} />
                    </Link>
                    {!compact && (
                      <p className="muted">
                        {sourceLabel[String(r.source ?? 'manual')]}
                      </p>
                    )}
                  </td>
                  <td>{String(r.started_at)}</td>
                  <td>{distance(Number(r.distance_m), profile.data?.units)}</td>
                  <td>{duration(Number(r.elapsed_s))}</td>
                  <td>
                    {duration(
                      (pace(Number(r.distance_m), Number(r.elapsed_s)) || 0) *
                        (profile.data?.units === 'imperial' ? 1.609344 : 1),
                    )}{' '}
                    /{profile.data?.units === 'imperial' ? 'mi' : 'km'}
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={comparisons.includes(String(r.id))}
                        onChange={() => toggle(String(r.id))}
                      />
                      Compare
                    </label>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(r);
                        open('record');
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setEditing(r);
                        open('delete');
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </DataTable>
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
                  <h2 style={{ fontSize: 24 }}>
                    <Link href={'/app/' + detailPath[name] + '/' + r.id}>
                      {String(r.title)} ↗
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
                      <p>{String(r.scheduled_on)}</p>
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
      {name === 'activities' && <UploadForm userId={userId} />}
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
