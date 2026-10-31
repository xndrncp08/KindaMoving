import { describe, it, expect } from 'vitest';
import { gpxFilename, toGpx } from '@/lib/gpx';
import { haversine, lineSlice } from '@/lib/geo';
import { generateSchema } from '@/lib/routes/schema';
describe('GPX export', () => {
  it('produces well-formed GPX 1.1 with escaped text', () => {
    const xml = toGpx(
      'Bow <River> & "Loop"',
      [
        [-114.07, 51.05],
        [-114.06, 51.051],
        [NaN, 1],
      ],
      "Ice? Don't",
    );
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.querySelector('trk > name')?.textContent).toBe(
      'Bow <River> & "Loop"',
    );
    expect(doc.querySelectorAll('trkpt')).toHaveLength(2); // invalid coordinate dropped
    expect(doc.querySelector('trkpt')?.getAttribute('lat')).toBe('51.050000');
    expect(gpxFilename('Bow <River> loop!')).toBe('Bow-River-loop.gpx');
    expect(gpxFilename('<<>>')).toBe('route.gpx');
  });
});
describe('line slicing', () => {
  const line = [
    [-114.07, 51.05],
    [-114.06, 51.05],
    [-114.05, 51.05],
  ];
  it('cuts by distance with interpolated ends', () => {
    const total = haversine(line[0], line[1]) + haversine(line[1], line[2]);
    const part = lineSlice(line, total * 0.25, total * 0.75);
    expect(part[0][0]).toBeCloseTo(-114.065, 4);
    expect(part.at(-1)![0]).toBeCloseTo(-114.055, 4);
    expect(part).toHaveLength(3);
  });
});
describe('route request validation', () => {
  it('bounds inputs and rejects a tempo longer than the run', () => {
    expect(
      generateSchema.safeParse({
        lat: 51,
        lon: -114,
        distance_m: 10000,
        tempo_m: 4000,
      }).success,
    ).toBe(true);
    expect(
      generateSchema.safeParse({
        lat: 51,
        lon: -114,
        distance_m: 5000,
        tempo_m: 6000,
      }).success,
    ).toBe(false);
    expect(
      generateSchema.safeParse({ lat: 91, lon: -114, distance_m: 5000 })
        .success,
    ).toBe(false);
    expect(
      generateSchema.safeParse({ lat: 51, lon: -114, distance_m: 100000 })
        .success,
    ).toBe(false);
  });
});
