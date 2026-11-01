'use client';
import {
  Bar,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Overview } from '@/lib/analytics';
export default function WeeklyChart({
  weekly,
  units,
}: {
  weekly: Overview['weekly'];
  units?: string;
}) {
  const div = units === 'imperial' ? 1609.344 : 1000;
  const data = weekly.map((w) => ({
    week: new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(w.week + 'T12:00:00')),
    distance: Math.round((w.distance_m / div) * 10) / 10,
    trimp: w.hr_runs ? Math.round(w.trimp) : null,
  }));
  const hasTrimp = data.some((d) => d.trimp);
  const tick = { fontSize: 11, fill: 'var(--muted)' };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="week"
          tick={tick}
          tickLine={false}
          axisLine={{ stroke: 'var(--line)' }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          yAxisId="d"
          tick={tick}
          tickLine={false}
          axisLine={false}
          unit={units === 'imperial' ? ' mi' : ' km'}
          width={56}
        />
        {hasTrimp && (
          <YAxis
            yAxisId="t"
            orientation="right"
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={40}
          />
        )}
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} />
        <Bar
          yAxisId="d"
          dataKey="distance"
          name="Distance"
          fill="var(--series-pace)"
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
        />
        {hasTrimp && (
          <Line
            yAxisId="t"
            dataKey="trimp"
            name="HR load (Edwards TRIMP)"
            stroke="var(--series-hr)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
