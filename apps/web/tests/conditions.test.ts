import { describe, it, expect } from 'vitest';
import {
  assess,
  assessAll,
  cluster,
  decay,
  halfLife,
  hazardWeight,
  PRIOR,
  type NearReport,
} from '@/lib/conditions';
const now = new Date('2026-12-01T12:00:00Z');
const hoursAgo = (h: number) =>
  new Date(now.getTime() - h * 3600000).toISOString();
let n = 0;
const report = (over: Partial<NearReport> = {}): NearReport => ({
  id: 'r' + n++,
  kind: 'ice',
  severity: 3,
  lat: 51.0532,
  lon: -114.0727,
  observed_at: hoursAgo(1),
  ends_at: null,
  description: 'Ice',
  source: 'user',
  source_name: null,
  own: false,
  reporter_reliability: 0.8,
  reporter_key: 'k' + n,
  votes: [],
  ...over,
});
describe('confidence model', () => {
  it('a fresh reliable report makes ice likely; age makes it stale, not "clear"', () => {
    expect(assess([report()], now)!.status).toBe('likely');
    const old = assess([report({ observed_at: hoursAgo(120) })], now)!;
    expect(old.status).toBe('stale');
    expect(old.probability).toBeGreaterThan(PRIOR); // never below "no information"
  });
  it('one reporter repeating themselves counts once', () => {
    const one = assess(
      [report({ reporter_key: 'same', reporter_reliability: 0.4 })],
      now,
    )!;
    const spam = assess(
      Array.from({ length: 5 }, () =>
        report({ reporter_key: 'same', reporter_reliability: 0.4 }),
      ),
      now,
    )!;
    expect(spam.probability).toBe(one.probability);
    expect(spam.independent_sources).toBe(1);
  });
  it('independent confirmations raise and clears lower confidence; both together are conflicting', () => {
    const base = report({
      reporter_reliability: 0.5,
      observed_at: hoursAgo(10),
    });
    const p0 = assess([base], now)!.probability;
    const confirmed = assess(
      [{ ...base, votes: [{ vote: 'confirm', at: hoursAgo(1), voter: 'v1' }] }],
      now,
    )!;
    const cleared = assess(
      [{ ...base, votes: [{ vote: 'clear', at: hoursAgo(1), voter: 'v2' }] }],
      now,
    )!;
    expect(confirmed.probability).toBeGreaterThan(p0);
    expect(cleared.probability).toBeLessThan(p0);
    const both = assess(
      [
        {
          ...base,
          votes: [
            { vote: 'confirm', at: hoursAgo(1), voter: 'v1' },
            { vote: 'clear', at: hoursAgo(1), voter: 'v2' },
          ],
        },
      ],
      now,
    )!;
    expect(both.conflicting).toBe(true);
  });
  it('flags never count as evidence', () => {
    const base = report();
    expect(
      assess(
        [{ ...base, votes: [{ vote: 'flag', at: hoursAgo(0.5), voter: 'x' }] }],
        now,
      )!.probability,
    ).toBe(assess([base], now)!.probability);
  });
  it('thaw shortens ice half-life; rain lengthens wetness', () => {
    expect(halfLife('ice', { max_temp_c: 9 })).toBe(4.5);
    expect(halfLife('ice', { max_temp_c: -8 })).toBe(18);
    expect(halfLife('wet', { precip_mm: 3 })).toBe(8);
    const thawed = assess([report({ observed_at: hoursAgo(12) })], now, {
      max_temp_c: 10,
    })!;
    const frozen = assess([report({ observed_at: hoursAgo(12) })], now, {
      max_temp_c: -10,
    })!;
    expect(thawed.probability).toBeLessThan(frozen.probability);
  });
  it('official closures hold until their published end, then disappear', () => {
    const live = report({
      kind: 'closure',
      source: 'official',
      source_name: 'City of Calgary',
      reporter_reliability: 0.95,
      observed_at: hoursAgo(300),
      ends_at: hoursAgo(-5),
    });
    expect(assess([live], now)!.status).toBe('likely');
    expect(assess([{ ...live, ends_at: hoursAgo(1) }], now)).toBeNull();
  });
  it('clusters by kind and distance; weights only current hazards', () => {
    const a = report();
    const near = report({ lat: 51.0534 }); // ~22 m
    const far = report({ lat: 51.0545 }); // ~145 m
    const wet = report({ kind: 'wet' });
    expect(
      cluster([a, near, far, wet])
        .map((g) => g.length)
        .sort(),
    ).toEqual([1, 1, 2]);
    const [top] = assessAll([a, near], now);
    expect(hazardWeight(top)).toBeCloseTo(top.probability, 3);
    expect(hazardWeight({ ...top, status: 'stale' })).toBe(0);
  });
  it('is monotone: older evidence never weighs more', () => {
    for (let h = 0; h < 200; h += 7)
      expect(decay(h + 1, 18)).toBeLessThanOrEqual(decay(h, 18));
    let prev = 1;
    for (let age = 0; age < 96; age += 3) {
      const p = assess(
        [report({ observed_at: hoursAgo(age), reporter_key: 'fixed' })],
        now,
      )!.probability;
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });
});
