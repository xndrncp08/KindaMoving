'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Map, Upload } from 'lucide-react';
import {
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Button,
  Provenance,
} from '@km/ui';
import {
  recordsQuery,
  profileQuery,
  summaryQuery,
  overviewQuery,
} from '@/lib/queries';
import {
  day,
  distance,
  duration,
  pace,
  span,
  today as todayIn,
  weekOf,
} from '@/lib/metrics';
import { useDashboard } from '@/lib/stores';
import { HomeStatus } from './home-status';

const noop = () => () => {};
const km = (m: number, units?: string, locale?: string) =>
  (m / (units === 'imperial' ? 1609.344 : 1000)).toLocaleString(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
const paceText = (m: number, s: number, units?: string) => {
  const p = pace(m, s);
  if (p == null) return '—';
  return `${duration(units === 'imperial' ? p * 1.609344 : p)} /${units === 'imperial' ? 'mi' : 'km'}`;
};

export function Dashboard({
  userId,
  zone,
  locale,
  serverToday,
}: {
  userId: string;
  /** The calendar date the server rendered with; the first client render reuses it. */
  serverToday?: string;
  /** The runner's zone/locale (remembered cookie) so server and client agree. */
  zone?: string;
  locale?: string;
}) {
  const activities = useQuery(recordsQuery(userId, 'activities'));
  const shoes = useQuery(recordsQuery(userId, 'shoes'));
  const workouts = useQuery(recordsQuery(userId, 'workouts'));
  const profile = useQuery(profileQuery(userId));
  const summary = useQuery(summaryQuery(userId));
  const overview = useQuery(overviewQuery(userId));
  // "Today" is the runner's calendar date. Hydration uses the date the server
  // rendered with (none on a first visit: skeleton), then React switches to the
  // browser's own date. They can differ near midnight (clocks or tz databases,
  // e.g. Alberta's 2026 change) without ever causing a hydration mismatch.
  const today = useSyncExternalStore(
    noop,
    () => todayIn(zone),
    () => serverToday ?? null,
  );
  const showGear = useDashboard((s) => s.showGear);
  const toggle = useDashboard((s) => s.toggleGear);
  if (!today || activities.isPending || profile.isPending)
    return (
      <div className="stack">
        <Skeleton />
        <Skeleton />
      </div>
    );
  const error =
    summary.error ||
    activities.error ||
    profile.error ||
    shoes.error ||
    workouts.error;
  if (error)
    return (
      <ErrorState
        message={`${error.message} Check your connection, then try again.`}
        retry={() => {
          void summary.refetch();
          void activities.refetch();
          void profile.refetch();
          void shoes.refetch();
          void workouts.refetch();
        }}
      />
    );
  const runs = activities.data || [];
  const units = profile.data?.units;
  const unit = units === 'imperial' ? 'mi' : 'km';
  const goal = profile.data?.weekly_distance_m || 0;
  const days = weekOf(today);
  const perDay = days.map((d) =>
    runs
      .filter((r) => r.started_at?.slice(0, 10) === d)
      .reduce((s, r) => s + r.distance_m, 0),
  );
  // Same Monday-start local week as the bars below, so the two always agree.
  const weekly = perDay.reduce((sum, m) => sum + m, 0);
  const peak = Math.max(...perDay, goal / 5, 1);
  const last = runs[0];
  // The list selects every column; planned_distance_m comes from the training migration.
  const next = (
    (workouts.data ?? []) as ((typeof workouts.data & {})[number] & {
      planned_distance_m?: number | null;
    })[]
  )
    .filter((w) => w.scheduled_on >= today && !w.completed)
    .sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on))[0];
  const load = overview.data?.load;
  const consistency = overview.data?.consistency;
  const pct = goal > 0 ? Math.min(100, Math.round((weekly / goal) * 100)) : 0;
  return (
    <div className="stack home">
      <header className="page-head row between">
        <div>
          <p className="eyebrow" suppressHydrationWarning>
            {day(
              today,
              { weekday: 'long', month: 'long', day: 'numeric' },
              locale,
            )}
          </p>
          <h1 className="page-title">
            Hey, {profile.data?.preferred_name || 'runner'}.
          </h1>
        </div>
        {/* On phones these live in the tab bar and header; desktop keeps them here. */}
        <div className="row hide-sm">
          <Button asChild variant="outline">
            <Link href="/app/routes/plan">
              <Map size={16} aria-hidden="true" />
              Plan a Route
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/activities#import">
              <Upload size={16} aria-hidden="true" />
              Import Run
            </Link>
          </Button>
        </div>
      </header>

      <section className="card week" aria-labelledby="week-title">
        <div className="week-head">
          <div>
            <h2 id="week-title" className="eyebrow">
              This week · since Monday
            </h2>
            <p className="hero-num num">
              {km(weekly, units, locale)}
              <span className="unit">{unit}</span>
            </p>
            {goal > 0 ? (
              <p className="muted">
                {pct}% of your {km(goal, units, locale)} {unit} goal
                {weekly < goal &&
                  ` · ${km(goal - weekly, units, locale)} ${unit} to go`}
              </p>
            ) : (
              <p className="muted">
                No weekly goal yet. <Link href="/app/settings">Set one</Link>
              </p>
            )}
          </div>
          {load && (
            <dl className="week-stats">
              <div>
                <dt className="eyebrow">Time on feet</dt>
                <dd className="num">{span(load.last7_s)}</dd>
                <dd className="muted">
                  vs {span(load.weekly_avg28_s)} weekly avg (28 days)
                </dd>
              </div>
              {consistency && (
                <div>
                  <dt className="eyebrow">Consistency</dt>
                  <dd className="num">
                    {consistency.active_weeks}/{consistency.of_weeks} weeks
                  </dd>
                  <dd className="muted">
                    {consistency.runs_per_week} runs per week
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
        {goal > 0 && (
          <div
            className="goal-bar"
            role="meter"
            aria-label="Weekly distance goal"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(weekly, goal)}
            aria-valuetext={`${km(weekly, units, locale)} of ${km(goal, units, locale)} ${unit}`}
          >
            <span style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        )}
        <ol className="week-days" aria-label="Distance by day">
          {days.map((d, i) => (
            <li
              key={d}
              aria-current={d === today ? 'date' : undefined}
              className={d > today ? 'future' : undefined}
            >
              <span
                className="bar"
                style={{
                  transform: `scaleY(${Math.max(perDay[i] / peak, 0.02)})`,
                }}
                aria-hidden="true"
              />
              <span className="num day-km">
                {perDay[i] ? km(perDay[i], units, locale) : '–'}
              </span>
              <span className="day-name" suppressHydrationWarning>
                {day(d, { weekday: 'short' }, locale)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid two home-pair">
        <Card className="next-up">
          <p className="eyebrow">Next up</p>
          {next ? (
            <>
              <h2>
                <Link href={'/app/training/' + next.id}>{next.title}</Link>
              </h2>
              <p className="muted" suppressHydrationWarning>
                {next.scheduled_on === today
                  ? 'Today'
                  : day(
                      next.scheduled_on,
                      {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      },
                      locale,
                    )}
                {next.planned_distance_m
                  ? ` · ${distance(next.planned_distance_m, units)}`
                  : ''}
              </p>
              <Button asChild variant="outline">
                <Link href="/app/training">Open Training Week</Link>
              </Button>
            </>
          ) : (
            <p className="next-empty">
              <span>
                <strong>Nothing scheduled.</strong>{' '}
                <span className="muted">Plan around your race distance.</span>
              </span>
              <Link href="/app/training/plan" className="link-arrow">
                Build a Plan <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </p>
          )}
        </Card>
        <Card className="last-run">
          <p className="eyebrow">Last run</p>
          {last ? (
            <>
              <h2>
                <Link href={'/app/activities/' + last.id}>{last.title}</Link>
              </h2>
              <dl className="stat-strip">
                <div>
                  <dt>Distance</dt>
                  <dd className="num">
                    {km(last.distance_m, units, locale)}
                    <span className="unit">{unit}</span>
                  </dd>
                </div>
                <div>
                  <dt>Moving</dt>
                  <dd className="num">
                    {duration(last.moving_s ?? last.elapsed_s)}
                  </dd>
                </div>
                <div>
                  <dt>Pace</dt>
                  <dd className="num">
                    {paceText(
                      last.distance_m,
                      last.moving_s ?? last.elapsed_s,
                      units,
                    )}
                  </dd>
                </div>
                {last.avg_hr != null && (
                  <div>
                    <dt>Avg HR</dt>
                    <dd className="num">
                      {Math.round(last.avg_hr)}
                      <span className="unit">bpm</span>
                    </dd>
                  </div>
                )}
              </dl>
              <div className="row between">
                <Provenance
                  kind={last.source === 'manual' ? 'estimated' : 'measured'}
                />
                <Link
                  href={'/app/activities/' + last.id}
                  className="link-arrow"
                >
                  Analyze this run <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </>
          ) : (
            <EmptyState title="No runs yet">
              Import a GPX or FIT file, connect COROS in Settings, or log a run
              by hand.
            </EmptyState>
          )}
        </Card>
      </div>

      <HomeStatus userId={userId} />

      {runs.length > 1 && (
        <section aria-labelledby="recent-title" className="stack recent">
          <div className="row between">
            <h2 id="recent-title">Recent runs</h2>
            <Link href="/app/activities" className="link-arrow">
              All runs <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="hide-sm">Run</th>
                  <th className="n">Distance</th>
                  <th className="n">Pace</th>
                  <th className="n hide-sm">Climb</th>
                  <th className="n hide-sm">Avg HR</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 6).map((r) => (
                  <tr key={r.id}>
                    <td suppressHydrationWarning>
                      <Link href={'/app/activities/' + r.id}>
                        {day(
                          r.started_at,
                          {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          },
                          locale,
                        )}
                      </Link>
                    </td>
                    <td className="truncate-cell hide-sm">{r.title}</td>
                    <td className="n">
                      {km(r.distance_m, units, locale)} {unit}
                    </td>
                    <td className="n">
                      {paceText(r.distance_m, r.moving_s ?? r.elapsed_s, units)}
                    </td>
                    <td className="n hide-sm">
                      {r.elevation_gain_m != null
                        ? `${Math.round(r.elevation_gain_m)} m`
                        : '—'}
                    </td>
                    <td className="n hide-sm">
                      {r.avg_hr != null ? Math.round(r.avg_hr) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="gear-title" className="stack shoes">
        <div className="row between">
          <h2 id="gear-title">Shoe rotation</h2>
          <Button variant="ghost" onClick={toggle} aria-expanded={showGear}>
            {showGear ? 'Hide Mileage' : 'Show Mileage'}
          </Button>
        </div>
        {showGear &&
          (shoes.data?.length ? (
            <ul className="shoe-list">
              {shoes.data.map((s) => (
                <li key={s.id}>
                  <Link href={'/app/gear/' + s.id}>{s.title}</Link>
                  <span className="num">
                    {distance(summary.data?.shoes[s.id] || 0, units)}
                  </span>
                  {s.retired && <span className="badge quiet">Retired</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No shoes yet. <Link href="/app/gear">Add a pair in Gear</Link> to
              track their mileage.
            </p>
          ))}
      </section>
    </div>
  );
}
