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
  const parent = document.createElement('div');
  const panel = document.createElement('section');
  parent.append(panel);
  result.current.ref.current = panel;
  const target = document.createElement('button');
  target.setPointerCapture = () => {};
  act(() => {
    result.current.handleProps.onPointerDown({
      button: 0,
      currentTarget: target,
      pointerId: 1,
      clientY: 200,
      timeStamp: 0,
    } as unknown as React.PointerEvent);
    result.current.handleProps.onPointerMove({
      clientY: 300,
      timeStamp: 10,
    } as React.PointerEvent);
  });
  expect(panel.style.getPropertyValue('--sheet-drag')).not.toBe('');
  expect(result.current.snap).toBe('full');
  act(() => result.current.handleProps.onPointerCancel());
  expect(panel.style.getPropertyValue('--sheet-drag')).toBe('');
  act(() =>
    result.current.handleProps.onPointerUp({
      clientY: 400,
      timeStamp: 20,
    } as React.PointerEvent),
  );
  expect(result.current.snap).toBe('full');
});
