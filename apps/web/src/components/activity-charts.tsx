'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint } from '@/lib/streams';
import { duration } from '@/lib/metrics';
const axis = { fontSize: 12, fill: 'var(--muted)' };
export default function ActivityCharts({ points }: { points: ChartPoint[] }) {
  const hasHr = points.some((p) => p.hr);
  const hasEle = points.some((p) => p.ele !== null);
  return (
    <div className="stack">
      <figure aria-label="Pace over distance">
        <figcaption className="eyebrow">Pace (30 s window)</figcaption>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={points} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="km"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={axis}
              unit=" km"
            />
            <YAxis
              reversed
              tick={axis}
              tickFormatter={(v) => duration(v)}
              width={48}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(v) => duration(Number(v)) + ' /km'}
              labelFormatter={(v) => v + ' km'}
            />
            <Line
              dataKey="pace"
              dot={false}
              stroke="var(--accent-strong, #6d871b)"
              strokeWidth={1.5}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </figure>
      {hasHr && (
        <figure aria-label="Heart rate over distance">
          <figcaption className="eyebrow">Heart rate</figcaption>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={points} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="km"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={axis}
                unit=" km"
              />
              <YAxis
                tick={axis}
                width={48}
                domain={['auto', 'auto']}
                unit=" bpm"
              />
              <Tooltip labelFormatter={(v) => v + ' km'} />
              <Line
                dataKey="hr"
                dot={false}
                stroke="#c2410c"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </figure>
      )}
      {hasEle && (
        <figure aria-label="Elevation over distance">
          <figcaption className="eyebrow">Elevation (smoothed)</figcaption>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={points} margin={{ left: 8, right: 8 }}>
              <XAxis
                dataKey="km"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={axis}
                unit=" km"
              />
              <YAxis
                tick={axis}
                width={48}
                domain={['auto', 'auto']}
                unit=" m"
              />
              <Tooltip labelFormatter={(v) => v + ' km'} />
              <Area
                dataKey="ele"
                stroke="#64748b"
                fill="#94a3b8"
                fillOpacity={0.3}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </figure>
      )}
    </div>
  );
}
