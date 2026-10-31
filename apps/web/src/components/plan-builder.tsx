'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Card, DataTable, ErrorState, Input } from '@km/ui';
import { api, keys } from '@/lib/queries';
import { describe } from '@/lib/training/steps';
import type { PlannedWorkout } from '@/lib/training/plan';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
interface Preview {
  workouts: PlannedWorkout[];
  weeks: { week: number; phase: string; volume_m: number }[];
  start_date: string;
  peak_m: number;
  start_m: number;
  volume_basis: string;
  paces: { basis: string };
}
export function PlanBuilder({ userId }: { userId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const [race, setRace] = useState('half');
  const [date, setDate] = useState('');
  const [days, setDays] = useState([1, 3, 5, 6]);
  const [longDay, setLongDay] = useState(6);
  const [experience, setExperience] = useState('');
  const body = () =>
    JSON.stringify({
      race,
      race_date: date,
      run_days: days,
      long_run_day: longDay,
      experience: experience || undefined,
      today: new Date().toLocaleDateString('en-CA'),
    });
  const preview = useMutation({
    mutationFn: () =>
      api<Preview>('training/plan?preview=1', { method: 'POST', body: body() }),
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; workouts: number }>('training/plan', {
        method: 'POST',
        body: body(),
      }),
    onSuccess: (r) => {
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'workouts'),
      });
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'training'),
      });
      toast.success(`Plan created with ${r.workouts} workouts.`);
      router.push('/app/training');
    },
  });
  const p = preview.data;
  return (
    <div className="stack">
      <Card>
        <div className="row">
          <label>
            Race
            <select value={race} onChange={(e) => setRace(e.target.value)}>
              <option value="5k">5 km</option>
              <option value="10k">10 km</option>
              <option value="half">Half marathon</option>
              <option value="marathon">Marathon</option>
            </select>
          </label>
          <label>
            Race day
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Experience
            <select
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            >
              <option value="">From my profile</option>
              <option value="new">New</option>
              <option value="regular">Regular</option>
              <option value="experienced">Experienced</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Running days (3–6)</legend>
          {DAYS.map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={() =>
                  setDays((s) =>
                    s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort(),
                  )
                }
              />{' '}
              {d}
            </label>
          ))}
        </fieldset>
        <label>
          Long run on
          <select
            value={longDay}
            onChange={(e) => setLongDay(Number(e.target.value))}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {DAYS[d]}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!date || preview.isPending}
          onClick={() => preview.mutate()}
        >
          Preview plan
        </Button>
        {preview.error && <ErrorState message={preview.error.message} />}
      </Card>
      {p && (
        <Card>
          <h2>
            {p.weeks.length} weeks from {p.start_date}
          </h2>
          <p className="muted">
            Starts at {(p.start_m / 1000).toFixed(0)} km/week (from{' '}
            {p.volume_basis}) and peaks at {(p.peak_m / 1000).toFixed(0)} km —
            never more than 10% per week, with a lighter week every fourth week.
            Paces from {p.paces.basis}.
          </p>
          <DataTable headers={['Week', 'Phase', 'Volume', 'Sessions']}>
            {p.weeks.map((w) => (
              <tr key={w.week}>
                <td>{w.week}</td>
                <td>{w.phase}</td>
                <td>{(w.volume_m / 1000).toFixed(1)} km</td>
                <td>
                  {p.workouts
                    .filter((x) => x.week === w.week)
                    .map((x) => (
                      <span
                        key={x.scheduled_on}
                        title={x.steps.map(describe).join(', ')}
                      >
                        {
                          DAYS[
                            (new Date(x.scheduled_on + 'T12:00:00').getDay() +
                              6) %
                              7
                          ]
                        }{' '}
                        {x.kind} {(x.planned_distance_m / 1000).toFixed(1)}
                        {' · '}
                      </span>
                    ))}
                </td>
              </tr>
            ))}
          </DataTable>
          <p className="muted">
            This plan does not predict or prevent injury. Adjust or skip
            sessions when something hurts.
          </p>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            Create plan
          </Button>
          {create.error && <ErrorState message={create.error.message} />}
        </Card>
      )}
    </div>
  );
}
