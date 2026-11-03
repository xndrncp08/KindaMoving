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
import { useId, useState } from 'react';
import { WhenVisible } from './when-visible';
import { duration } from '@/lib/metrics';
const axis = { fontSize: 11, fill: 'var(--muted)' };
const km = (v: unknown) => `${Number(v).toFixed(2)} km`;
/**
 * Pace, heart rate and elevation share one distance axis and one crosshair
 * (Recharts syncId); the hovered sample is reported so the map can follow.
 */
export default function ActivityCharts({
  points,
  imperial = false,
  onCursor,
}: {
  points: ChartPoint[];
  imperial?: boolean;
  onCursor?: (p: ChartPoint | null) => void;
}) {
  const id = useId();
  const [sample, setSample] = useState(0);
  const hasHr = points.some((p) => p.hr);
  const hasEle = points.some((p) => p.ele !== null);
  const factor = imperial ? 1.609344 : 1;
  const unit = imperial ? ' /mi' : ' /km';
  const events = {
    syncId: 'run',
    syncMethod: 'value' as const,
    margin: { left: 4, right: 12, top: 8, bottom: 0 },
    onMouseMove: (s: { activeTooltipIndex?: number | string | null }) =>
      onCursor?.(
        s.activeTooltipIndex == null
          ? null
          : (points[Number(s.activeTooltipIndex)] ?? null),
      ),
    onMouseLeave: () => onCursor?.(null),
  };
  const x = (
    <XAxis
      dataKey="km"
      type="number"
      domain={['dataMin', 'dataMax']}
      tick={axis}
      tickFormatter={(v) => `${v}`}
      unit=" km"
      tickLine={false}
      axisLine={{ stroke: 'var(--line)' }}
    />
  );
  const grid = <CartesianGrid vertical={false} stroke="var(--line)" />;
  const cursor = { stroke: 'var(--ink)', strokeWidth: 1 };
  return (
    <div className="streams">
      <label htmlFor={id}>
        Trace run sample
        <input
          id={id}
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={sample}
          aria-valuetext={
            points[sample]
              ? `${points[sample].km.toFixed(2)} km${points[sample].pace ? `, ${duration(points[sample].pace! * factor)}${unit}` : ''}`
              : 'No samples'
          }
          onChange={(event) => {
            const index = Number(event.target.value);
            setSample(index);
            onCursor?.(points[index] ?? null);
          }}
        />
      </label>
      <figure>
        <figcaption>
          <span className="eyebrow">Pace</span>
          <span className="prov prov-measured">30 s moving window</span>
        </figcaption>
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={points} {...events}>
            {grid}
            {x}
            <YAxis
              reversed
              tick={axis}
              tickFormatter={(v) => duration(v * factor)}
              width={44}
              domain={['auto', 'auto']}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={cursor}
              formatter={(v) => [duration(Number(v) * factor) + unit, 'Pace']}
              labelFormatter={km}
            />
            <Line
              dataKey="pace"
              dot={false}
              stroke="var(--series-pace)"
              strokeWidth={1.75}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </figure>
      {hasHr && (
        <figure>
          <figcaption>
            <span className="eyebrow">Heart rate (bpm)</span>
            <span className="prov prov-measured">Sensor</span>
          </figcaption>
          <WhenVisible label="heart rate chart" height={130}>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={points} {...events}>
                {grid}
                {x}
                <YAxis
                  tick={axis}
                  width={44}
                  domain={['auto', 'auto']}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={cursor}
                  formatter={(v) => [`${v} bpm`, 'Heart rate']}
                  labelFormatter={km}
                />
                <Line
                  dataKey="hr"
                  dot={false}
                  stroke="var(--series-hr)"
                  strokeWidth={1.75}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </WhenVisible>
        </figure>
      )}
      {hasEle && (
        <figure>
          <figcaption>
            <span className="eyebrow">Elevation (m)</span>
            <span className="prov prov-measured">Smoothed</span>
          </figcaption>
          <WhenVisible label="elevation chart" height={110}>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={points} {...events}>
                {grid}
                {x}
                <YAxis
                  tick={axis}
                  width={44}
                  domain={['auto', 'auto']}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={cursor}
                  formatter={(v) => [`${Math.round(Number(v))} m`, 'Elevation']}
                  labelFormatter={km}
                />
                <Area
                  dataKey="ele"
                  stroke="var(--series-terrain)"
                  fill="var(--series-terrain)"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </WhenVisible>
        </figure>
      )}
    </div>
  );
}
