import { describe, expect, it } from 'vitest';
import { settle, snapHeight } from '@/lib/use-sheet';

describe('bottom sheet snapping', () => {
  const ws = 700;
  it('keeps the map visible above a full sheet', () => {
    expect(snapHeight('full', ws)).toBe(636);
    expect(snapHeight('half', ws)).toBe(350);
    expect(snapHeight('peek', ws)).toBe(72);
  });
  it('settles a slow drag on the closest snap', () => {
    expect(settle('half', 400, ws)).toBe('half');
    expect(settle('half', 560, ws)).toBe('full');
    expect(settle('half', 150, ws)).toBe('peek');
  });
  it('moves one snap on a flick regardless of distance', () => {
    expect(settle('peek', 90, ws, 1.2)).toBe('half');
    expect(settle('full', 620, ws, -0.9)).toBe('half');
    expect(settle('full', 620, ws, 2)).toBe('full');
    expect(settle('peek', 72, ws, -2)).toBe('peek');
  });
});

import { renderHook, act } from '@testing-library/react';
import { useSheet } from '@/lib/use-sheet';
it('preserves a restored stop and discards a browser-cancelled drag', () => {
  const { result } = renderHook(() => useSheet('full'));
  expect(result.current.snap).toBe('full');
  act(() => result.current.handleProps.onPointerCancel());
  expect(result.current.snap).toBe('full');
});
