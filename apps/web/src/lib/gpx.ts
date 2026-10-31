/** GPX 1.1 track for a GeoJSON LineString ([lon, lat] pairs). Importable by the COROS app and most watches. */
const esc = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[c]!,
  );
export function toGpx(name: string, coordinates: number[][], description = '') {
  const points = coordinates
    .filter(
      (c) =>
        c.length >= 2 &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        Math.abs(c[1]) <= 90 &&
        Math.abs(c[0]) <= 180,
    )
    .map(
      ([lon, lat]) =>
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="KindaMoving" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(name)}</name>
    <copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/</license></copyright>
  </metadata>
  <trk>
    <name>${esc(name)}</name>${description ? `\n    <desc>${esc(description)}</desc>` : ''}
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}
export const gpxFilename = (title: string) =>
  (title
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'route') + '.gpx';
