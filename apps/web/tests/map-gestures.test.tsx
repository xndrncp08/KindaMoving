import { it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
const { options } = vi.hoisted(() => ({ options: vi.fn() }));
vi.mock('@/lib/maplibre', () => ({
  maplibregl: {
    Map: class {
      constructor(config: unknown) {
        options(config);
      }
      addControl() {}
      on() {}
      remove() {}
    },
    NavigationControl: class {},
  },
}));
import PlannerMap from '@/components/planner-map';
afterEach(() => {
  cleanup();
  options.mockClear();
});
it('uses cooperative gestures on embedded maps', () => {
  render(<PlannerMap legend={false} />);
  expect(options.mock.calls[0][0].cooperativeGestures).toBe(true);
});
it('preserves direct pan/pinch in the full-screen planner', () => {
  render(<PlannerMap cooperative={false} legend={false} />);
  expect(options.mock.calls[0][0].cooperativeGestures).toBe(false);
});
