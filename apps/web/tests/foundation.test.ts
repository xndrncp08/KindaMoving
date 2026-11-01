import { describe, it, expect, beforeEach } from 'vitest';
import {
  activitySchema,
  profileSchema,
  routeSchema,
  shoeSchema,
  workoutSchema,
} from '@km/types';
import { pace, duration, distance, shoeMileage, span } from '@/lib/metrics';
import { validateUpload, MAX_FILE_BYTES } from '@/lib/ingestion';
import { safeNext } from '@/lib/env';
import {
  resetStores,
  useComparison,
  useDashboard,
  useMap,
  useRouteEditor,
  useWorkoutBuilder,
  useInteraction,
  usePreferences,
} from '@/lib/stores';
const activity = {
  title: 'Park loop',
  started_at: '2026-10-31',
  distance_m: 5000,
  elapsed_s: 1500,
  shoe_id: null,
};
const profile = {
  preferred_name: 'Runner',
  country: 'Canada',
  city: 'Edmonton',
  units: 'metric',
  experience: 'new',
  weekly_distance_m: 20000,
  race_distance: '5k',
  goals: 'Stay consistent',
  private_profile: true,
  notifications: false,
};
describe('boundary validation', () => {
  it('accepts manual activities and discards ownership input', () => {
    expect(activitySchema.parse({ ...activity, user_id: 'forged' })).toEqual(
      activity,
    );
  });
  it.each([
    { distance_m: 0 },
    { elapsed_s: -1 },
    { elapsed_s: 1.5 },
    { started_at: '2026-02-31' },
    { shoe_id: 'bad' },
    { title: ' ' },
    { distance_m: Infinity },
  ])('rejects invalid activity %j', (bad) => {
    expect(activitySchema.safeParse({ ...activity, ...bad }).success).toBe(
      false,
    );
  });
  it('validates onboarding and privacy', () => {
    expect(profileSchema.parse(profile)).toEqual(profile);
    expect(
      profileSchema.safeParse({ ...profile, units: 'yards' }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...profile, private_profile: 'false' }).success,
    ).toBe(false);
  });
  it('validates all other CRUD domains', () => {
    expect(
      routeSchema.safeParse({ title: 'Loop', distance_m: -1 }).success,
    ).toBe(false);
    expect(
      shoeSchema.safeParse({ title: 'Daily', brand: 'Test', retired: true })
        .success,
    ).toBe(true);
    expect(
      workoutSchema.safeParse({ title: 'Easy', scheduled_on: 'bad' }).success,
    ).toBe(false);
  });
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', null])(
    'keeps callback redirect local: %s',
    (s) => expect(safeNext(s)).toBe('/app'),
  );
  it('permits a local recovery callback', () =>
    expect(safeNext('/app/settings?recovery=1')).toBe(
      '/app/settings?recovery=1',
    ));
});
describe('basic metrics', () => {
  it('calculates pace without inventing zero-distance results', () => {
    expect(pace(5000, 1500)).toBe(300);
    expect(pace(0, 12)).toBeNull();
    expect(pace(Infinity, 12)).toBeNull();
    expect(pace(1, -1)).toBeNull();
  });
  it('formats rounded seconds and display units', () => {
    expect(duration(359.8)).toBe('6:00');
    expect(duration(4777)).toBe('1:19:37');
    expect(span(4777)).toBe('1 h 20 min');
    expect(distance(1609.344, 'imperial')).toBe('1.00 mi');
  });
  it('adds only assigned activity mileage to existing wear', () =>
    expect(
      shoeMileage({ id: 's', initial_distance_m: 100 }, [
        { shoe_id: 's', distance_m: 5000 },
        { shoe_id: 'other', distance_m: 9000 },
      ]),
    ).toBe(5100));
});
describe('client state', () => {
  beforeEach(resetStores);
  it('caps comparison, removes selections, clears identity state', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e'])
      useComparison.getState().toggle(id);
    expect(useComparison.getState().ids).toEqual(['b', 'c', 'd', 'e']);
    useComparison.getState().toggle('c');
    expect(useComparison.getState().ids).not.toContain('c');
    resetStores();
    expect(useComparison.getState().ids).toEqual([]);
  });
  it('resets every domain without retaining server records', () => {
    useDashboard.getState().toggleGear();
    useMap.getState().select('route');
    useRouteEditor.getState().setDirty(true);
    useWorkoutBuilder.getState().setDraftTitle('tempo');
    useInteraction.getState().open('delete');
    resetStores();
    expect(useDashboard.getState().showGear).toBe(true);
    expect(useMap.getState().selectedId).toBeNull();
    expect(useRouteEditor.getState().dirty).toBe(false);
    expect(useWorkoutBuilder.getState().draftTitle).toBe('');
    expect(useInteraction.getState().dialog).toBeNull();
  });
  it('persists only non-sensitive display preferences', () => {
    usePreferences.getState().setCompact(true);
    expect(JSON.parse(localStorage.getItem('km-display')!).state).toEqual({
      compact: true,
    });
  });
});
describe('ingestion admission', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  it('admits GPX as pending input only', () =>
    expect(
      validateUpload('loop.gpx', bytes('<?xml version="1.0"?><gpx></gpx>')),
    ).toBe('gpx'));
  it.each(['<!DOCTYPE gpx><gpx></gpx>', '<html></html>', '<gpx>'])(
    'rejects unsafe or unrecognized GPX',
    (s) => expect(() => validateUpload('x.gpx', bytes(s))).toThrow(),
  );
  it('rejects oversized, unsupported and path filenames', () => {
    expect(() =>
      validateUpload('x.gpx', new Uint8Array(MAX_FILE_BYTES + 1)),
    ).toThrow();
    expect(() => validateUpload('../x.gpx', bytes('<gpx></gpx>'))).toThrow();
    expect(() => validateUpload('x.exe', bytes('data'))).toThrow();
  });
  it('requires FIT header signature', () => {
    const fit = new Uint8Array(14);
    fit[0] = 14;
    fit.set(bytes('.FIT'), 8);
    expect(validateUpload('watch.fit', fit)).toBe('fit');
    fit[8] = 0;
    expect(() => validateUpload('watch.fit', fit)).toThrow();
  });
});
