'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
/** Positive = you reached that point earlier than your ghost. */
export default function GapChart({
  gaps,
}: {
  gaps: { s: number; gap_s: number }[];
}) {
  const data = gaps.map((g) => ({ km: g.s / 1000, gap: g.gap_s }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="km"
          type="number"
          domain={['dataMin', 'dataMax']}
          unit=" km"
          tick={{ fontSize: 12 }}
        />
        <YAxis unit=" s" tick={{ fontSize: 12 }} width={56} />
        <ReferenceLine y={0} stroke="var(--ink-2)" />
        <Tooltip
          formatter={(v) =>
            `${Number(v) > 0 ? 'ahead' : 'behind'} by ${Math.abs(Number(v)).toFixed(0)} s`
          }
          labelFormatter={(v) => `${Number(v).toFixed(2)} km`}
        />
        <Area
          dataKey="gap"
          stroke="var(--series-pace)"
          fill="var(--series-pace)"
          fillOpacity={0.25}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
