'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Snap = 'peek' | 'half' | 'full';
const ORDER: Snap[] = ['peek', 'half', 'full'];

/** Visible sheet height in px for each snap, given the workspace height. */
export function snapHeight(snap: Snap, workspace: number) {
  if (snap === 'peek') return 72;
  if (snap === 'half') return Math.round(workspace * 0.5);
  // Full leaves a strip of map so its tools stay reachable above the sheet.
  return workspace - 64;
}

/**
 * Where a drag settles: a flick (|velocity| > 0.5 px/ms, + = upward) moves one
 * snap from where the drag began; a slow release picks the closest snap.
 */
export function settle(
  from: Snap,
  height: number,
  workspace: number,
  velocity = 0,
): Snap {
  const i = ORDER.indexOf(from);
  if (velocity > 0.5) return ORDER[Math.min(2, i + 1)];
  if (velocity < -0.5) return ORDER[Math.max(0, i - 1)];
  return ORDER.reduce((best, s) =>
    Math.abs(snapHeight(s, workspace) - height) <
    Math.abs(snapHeight(best, workspace) - height)
      ? s
      : best,
  );
}

/**
 * Bottom sheet over a map. Only the handle starts a drag, so map pan/pinch and
 * the sheet's own scrolling never compete for the same gesture. The drag writes
 * a transform directly (no React render per frame) and settles on a snap.
 */
export function useSheet(initial: Snap = 'half') {
  const [snap, setSnap] = useState<Snap>(initial);
  const sheet = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    y: number;
    h: number;
    t: number;
    lastY: number;
    lastT: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const workspace = () => sheet.current?.parentElement?.clientHeight ?? 600;

  const apply = useCallback((h: number | null) => {
    const el = sheet.current;
    if (!el) return;
    el.style.setProperty('--sheet-drag', h == null ? '' : `${h}px`);
  }, []);

  useEffect(() => apply(null), [snap, apply]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const h = sheet.current?.getBoundingClientRect().height ?? 0;
    drag.current = {
      y: e.clientY,
      h,
      t: e.timeStamp,
      lastY: e.clientY,
      lastT: e.timeStamp,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    const max = snapHeight('full', workspace());
    apply(Math.max(snapHeight('peek', 0), Math.min(max, d.h + dy)));
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return; // a tap: onClick toggles
    suppressClick.current = true;
    const velocity = (d.lastY - e.clientY) / Math.max(1, e.timeStamp - d.lastT);
    const h = d.h + (d.y - e.clientY);
    apply(null);
    setSnap(settle(snap, h, workspace(), velocity));
  };
  // Tap or Enter/Space: toggle between the map-first peek and the working height.
  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setSnap((s) => (s === 'peek' ? 'half' : 'peek'));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = ORDER.indexOf(snap);
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      setSnap(ORDER[Math.min(2, i + 1)]);
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      setSnap(ORDER[Math.max(0, i - 1)]);
    }
  };
  return {
    snap,
    setSnap,
    ref: sheet,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      // Browser scrolling/rotation can cancel a gesture; cancellation must not choose a new stop.
      onPointerCancel: () => {
        drag.current = null;
        suppressClick.current = false;
        apply(null);
      },
      onKeyDown,
      onClick,
    },
  };
}
