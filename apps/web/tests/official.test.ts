import { describe, it, expect } from 'vitest';
import { zonedToUtc } from '@/lib/routes/time';
import { mapDetour, mapIncident } from '@/lib/server/official';
import { envBetween } from '@/lib/server/conditions';
describe('time zones', () => {
  it('converts wall-clock time across a DST change', () => {
    expect(
      zonedToUtc('2026-10-30T09:00:00.000', 'America/Denver')!.toISOString(),
    ).toBe('2026-10-30T15:00:00.000Z'); // MDT -6
    expect(
      zonedToUtc('2026-11-02T09:00:00.000', 'America/Denver')!.toISOString(),
    ).toBe('2026-11-02T16:00:00.000Z'); // MST -7
    expect(
      zonedToUtc('2026-10-30T09:00:00.000', 'America/Edmonton')!.toISOString(),
    ).toBe('2026-10-30T15:00:00.000Z'); // -6 in every tz version
    expect(zonedToUtc('garbage', 'America/Edmonton')).toBeNull();
  });
});
describe('City of Calgary mappers (rows captured from data.calgary.ca, 2026-10-31)', () => {
  const now = new Date('2026-10-31T18:00:00Z');
  it('maps a sidewalk closure detour to a severe closure with its published end', () => {
    const o = mapDetour(
      {
        construction_info: '13 Street between 11-12 Avenue SW',
        description:
          '¿\tFull road closure and W/S sidewalk closure on 13 ST & 11-12 AV SW¿\tFollow detour signs',
        start_dt: '2026-11-01T10:00:00.000',
        end_dt: '2026-11-01T16:00:00.000',
        longitude: '-114.0914',
        latitude: '51.0405',
      },
      now,
    )!;
    expect(o).toMatchObject({
      kind: 'closure',
      severity: 3,
      ends_at: zonedToUtc('2026-11-01T16:00:00.000', 'America/Edmonton'),
    });
    expect(o.description).not.toMatch(/[¿\t]/);
  });
  it('maps road-only work as low-severity construction and drops finished items', () => {
    const row = {
      construction_info: '50 Avenue at 20 Street SW',
      description: 'Lanes will be narrowed down and a flagman will be onsite.',
      start_dt: '2026-10-31T09:00:00.000',
      end_dt: '2026-10-31T15:00:00.000',
      longitude: '-114.109',
      latitude: '51.0087',
    };
    expect(mapDetour(row, new Date('2026-10-31T19:00:00Z'))).toMatchObject({
      kind: 'construction',
      severity: 1,
    });
    expect(mapDetour(row, new Date('2026-11-01T00:00:00Z'))).toBeNull();
  });
  it('maps traffic incidents with a 3-hour activity window', () => {
    const o = mapIncident({
      incident_info: '4 Street and 9 Avenue SE',
      description: 'Traffic incident.',
      start_dt_utc: '2026-10-31 09:03:31+00:00',
      modified_dt_utc: '2026-10-31 09:06:46+00:00',
      longitude: '-114.0532',
      latitude: '51.0442',
    })!;
    expect(o.ends_at!.toISOString()).toBe('2026-10-31T12:06:46.000Z');
    expect(mapIncident({ latitude: 'x' })).toBeNull();
  });
});
describe('weather since observation', () => {
  it('aggregates only the hours after the observation', () => {
    const h = {
      time: ['2026-12-01T08:00', '2026-12-01T09:00', '2026-12-01T10:00'],
      temperature_2m: [-5, 3, 7],
      precipitation: [1, 0, 0.5],
      snowfall: [0.2, 0, 0],
    };
    expect(
      envBetween(
        h,
        new Date('2026-12-01T09:30:00Z'),
        new Date('2026-12-01T10:30:00Z'),
      ),
    ).toEqual({ max_temp_c: 7, precip_mm: 0.5, snowfall_cm: 0 });
    expect(envBetween(null, new Date(), new Date())).toEqual({});
  });
});
