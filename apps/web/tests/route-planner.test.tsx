import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoutePlanner } from '@/components/route-planner';

let search = new URLSearchParams();
const replace = vi.fn((url: string) => {
  search = new URLSearchParams(url.slice(1));
});
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace, push: vi.fn() }),
}));
// The map is client-only MapLibre; a button stands in for a map click.
vi.mock('next/dynamic', () => ({
  default: () =>
    function Map(p: { onPick?: (lat: number, lon: number) => void }) {
      return (
        <button type="button" onClick={() => p.onPick?.(51.05, -114.07)}>
          map click
        </button>
      );
    },
}));

function setup() {
  const client = new QueryClient();
  const ui = () => (
    <QueryClientProvider client={client}>
      <RoutePlanner userId="runner" />
    </QueryClientProvider>
  );
  const view = render(ui());
  return () => view.rerender(ui());
}

afterEach(cleanup);
describe('route planner start point history', () => {
  beforeEach(() => {
    search = new URLSearchParams();
    replace.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ assessments: [], note: '' })),
    );
  });

  it('undoes and redoes start points with buttons and the keyboard', () => {
    const refresh = setup();
    const undo = () => screen.getByRole('button', { name: /^Undo start/ });
    const redo = () => screen.getByRole('button', { name: /^Redo start/ });
    expect(undo()).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'map click' }));
    refresh();
    expect(search.get('lat')).toBe('51.05000');
    expect(undo()).toHaveProperty('disabled', false);

    fireEvent.click(undo());
    refresh();
    expect(search.has('lat')).toBe(false);
    expect(redo()).toHaveProperty('disabled', false);

    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    refresh();
    expect(search.get('lon')).toBe('-114.07000');
    expect(redo()).toHaveProperty('disabled', true);
  });

  it('names invalid fields in words, not keys', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Distance (km)'), {
      target: { value: '99' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find Routes' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Distance must be 1–42.2 km.',
    );
  });
});
