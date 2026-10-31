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
    week: w.week.slice(5),
    distance: Math.round((w.distance_m / div) * 10) / 10,
    trimp: w.hr_runs ? Math.round(w.trimp) : null,
  }));
  const hasTrimp = data.some((d) => d.trimp);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
        <YAxis
          yAxisId="d"
          tick={{ fontSize: 12 }}
          unit={units === 'imperial' ? ' mi' : ' km'}
          width={56}
        />
        {hasTrimp && (
          <YAxis
            yAxisId="t"
            orientation="right"
            tick={{ fontSize: 12 }}
            width={40}
          />
        )}
        <Tooltip />
        <Bar
          yAxisId="d"
          dataKey="distance"
          name="Distance"
          fill="#6d871b"
          isAnimationActive={false}
        />
        {hasTrimp && (
          <Line
            yAxisId="t"
            dataKey="trimp"
            name="HR load (Edwards TRIMP)"
            stroke="#c2410c"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
