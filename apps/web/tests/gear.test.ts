import { it, expect } from 'vitest';
import { shoeSchema } from '@km/types';
it('normalises optional gear fields from form input', () => {
  const s = shoeSchema.parse({
    title: 'Daily',
    brand: 'X',
    purchase_price: '',
    purchased_on: '',
    retired_on: '2026-10-01',
    target_distance_m: '800000',
  });
  expect(s).toMatchObject({
    purchase_price: null,
    purchased_on: null,
    retired_on: '2026-10-01',
    target_distance_m: 800000,
    currency: 'CAD',
    is_default: false,
  });
  expect(
    shoeSchema.safeParse({ title: 'Daily', brand: 'X', purchase_price: -5 })
      .success,
  ).toBe(false);
  expect(
    shoeSchema.safeParse({ title: 'Daily', brand: 'X', currency: 'cad' })
      .success,
  ).toBe(false);
  expect(
    shoeSchema.safeParse({ title: 'Daily', brand: 'X', target_distance_m: 50 })
      .success,
  ).toBe(false);
});
