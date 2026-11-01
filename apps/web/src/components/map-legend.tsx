/** Map symbology shared by every MapLibre view; colours match docs/design/TOKENS.md. */
export const mapColor = {
  start: '#161816',
  waypoint: '#2f5fd0',
  major: '#b42318',
  minor: '#c27803',
  hazard: '#6c4ab6',
  ghost: '#8f8a7d',
  runner: '#161816',
  route: '#d4ff3a',
  casing: '#161816',
  other: '#6b6f69',
  highlight: '#c2410c',
} as const;
const items = {
  route: ['Selected route', mapColor.route, true],
  other: ['Other candidates', mapColor.other, false],
  highlight: ['Tempo section', mapColor.highlight, false],
  major: ['Major crossing', mapColor.major, false],
  minor: ['Minor crossing', mapColor.minor, false],
  hazard: ['Reported condition', mapColor.hazard, false],
  runner: ['You', mapColor.runner, false],
  ghost: ['Your ghost', mapColor.ghost, false],
  start: ['Report location', mapColor.start, false],
} as const;
export type LegendKey = keyof typeof items;
export const ROUTE_LEGEND: LegendKey[] = [
  'route',
  'other',
  'highlight',
  'major',
  'minor',
  'hazard',
];
export function MapLegend({
  className = '',
  keys = ROUTE_LEGEND,
}: {
  className?: string;
  keys?: LegendKey[];
}) {
  return (
    <p className={`legend ${className}`}>
      {keys.map((k) => {
        const [label, bg, ring] = items[k];
        return (
          <span key={k}>
            <i
              style={{
                background: bg,
                boxShadow: ring ? `0 0 0 2px ${mapColor.casing}` : undefined,
              }}
            />
            {label}
          </span>
        );
      })}
    </p>
  );
}
