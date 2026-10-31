'use client';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { Activity } from '@km/types';
export default function DistanceChart({
  activities,
  units,
}: {
  activities: Activity[];
  units?: string;
}) {
  const divisor = units === 'imperial' ? 1609.344 : 1000;
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        'Recent run distances: ' +
        activities
          .map(
            (a) =>
              `${a.title}: ${(a.distance_m / divisor).toFixed(2)} ${units === 'imperial' ? 'miles' : 'kilometres'}`,
          )
          .join(', ')
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={activities.map((a) => ({
            date: a.started_at,
            distance: Number((a.distance_m / divisor).toFixed(2)),
          }))}
        >
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis width={40} />
          <Tooltip />
          <Bar
            dataKey="distance"
            fill="#8fa42f"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
