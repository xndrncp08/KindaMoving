import { afterEach, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import { WhenVisible } from '@/components/when-visible';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('reserves space and mounts a secondary visualization only when visible', () => {
  let visible: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        visible = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  render(
    <WhenVisible label="chart" height={130}>
      <p>Heavy visualization</p>
    </WhenVisible>,
  );
  expect(screen.queryByText('Heavy visualization')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Load chart' }).parentElement?.style
      .height,
  ).toBe('130px');
  act(() =>
    visible(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(screen.getByText('Heavy visualization')).toBeTruthy();
  expect(disconnect).toHaveBeenCalled();
});
it('has a keyboard/click alternative without scrolling', () => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(
    <WhenVisible label="map">
      <p>Map</p>
    </WhenVisible>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Load map' }));
  expect(screen.getByText('Map')).toBeTruthy();
});
it('loads normally on browsers without IntersectionObserver', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  delete (window as unknown as Record<string, unknown>).IntersectionObserver;
  render(
    <WhenVisible label="map">
      <p>Map</p>
    </WhenVisible>,
  );
  expect(screen.getByText('Map')).toBeTruthy();
});
