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
export function MapLegend({ className = '' }: { className?: string }) {
  const item = (bg: string, label: string, ring = false) => (
    <span>
      <i
        style={{
          background: bg,
          boxShadow: ring ? `0 0 0 2px ${mapColor.casing}` : undefined,
        }}
      />
      {label}
    </span>
  );
  return (
    <p className={`legend ${className}`}>
      {item(mapColor.route, 'Selected route', true)}
      {item(mapColor.other, 'Other candidates')}
      {item(mapColor.highlight, 'Tempo section')}
      {item(mapColor.major, 'Major crossing')}
      {item(mapColor.minor, 'Minor crossing')}
      {item(mapColor.hazard, 'Reported condition')}
    </p>
  );
}
