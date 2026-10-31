import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const usePreferences = create<{
  compact: boolean;
  setCompact: (v: boolean) => void;
}>()(
  persist(
    (set) => ({ compact: false, setCompact: (compact) => set({ compact }) }),
    {
      name: 'km-display',
      skipHydration: true,
      partialize: (s) => ({ compact: s.compact }),
    },
  ),
);
export const useDashboard = create<{
  showGear: boolean;
  toggleGear: () => void;
}>((set) => ({
  showGear: true,
  toggleGear: () => set((s) => ({ showGear: !s.showGear })),
}));
export const useMap = create<{
  viewport: { longitude: number; latitude: number; zoom: number };
  selectedId: string | null;
  setViewport: (v: {
    longitude: number;
    latitude: number;
    zoom: number;
  }) => void;
  select: (id: string | null) => void;
}>((set) => ({
  viewport: { longitude: -114.07, latitude: 51.045, zoom: 11 },
  selectedId: null,
  setViewport: (viewport) => set({ viewport }),
  select: (selectedId) => set({ selectedId }),
}));
export interface Waypoint {
  lat: number;
  lon: number;
}
/** Interactive waypoint editing for one route; the computed path stays in Query. */
export const useRouteEditor = create<{
  routeId: string | null;
  waypoints: Waypoint[];
  dirty: boolean;
  setDirty: (v: boolean) => void;
  begin: (routeId: string, waypoints: Waypoint[]) => void;
  add: (w: Waypoint) => void;
  remove: (i: number) => void;
  move: (i: number, by: -1 | 1) => void;
  closeLoop: () => void;
}>((set) => ({
  routeId: null,
  waypoints: [],
  dirty: false,
  setDirty: (dirty) => set({ dirty }),
  begin: (routeId, waypoints) => set({ routeId, waypoints, dirty: false }),
  add: (w) =>
    set((s) => ({ waypoints: [...s.waypoints, w].slice(0, 60), dirty: true })),
  remove: (i) =>
    set((s) => ({
      waypoints: s.waypoints.filter((_, k) => k !== i),
      dirty: true,
    })),
  move: (i, by) =>
    set((s) => {
      const w = [...s.waypoints];
      const j = i + by;
      if (j < 0 || j >= w.length) return s;
      [w[i], w[j]] = [w[j], w[i]];
      return { waypoints: w, dirty: true };
    }),
  closeLoop: () =>
    set((s) =>
      s.waypoints.length > 1
        ? { waypoints: [...s.waypoints, s.waypoints[0]], dirty: true }
        : s,
    ),
}));
export const useWorkoutBuilder = create<{
  draftTitle: string;
  setDraftTitle: (s: string) => void;
}>((set) => ({
  draftTitle: '',
  setDraftTitle: (draftTitle) => set({ draftTitle }),
}));
export const useComparison = create<{
  ids: string[];
  toggle: (id: string) => void;
}>((set) => ({
  ids: [],
  toggle: (id) =>
    set((s) => ({
      ids: s.ids.includes(id)
        ? s.ids.filter((i) => i !== id)
        : [...s.ids.slice(-3), id],
    })),
}));
export const useInteraction = create<{
  dialog: string | null;
  announcement: string;
  open: (s: string | null) => void;
  announce: (s: string) => void;
}>((set) => ({
  dialog: null,
  announcement: '',
  open: (dialog) => set({ dialog }),
  announce: (announcement) => set({ announcement }),
}));
/** Ghost replay playback (seconds into the replay). */
export const useGhostPlayback = create<{
  t: number;
  playing: boolean;
  speed: number;
  setT: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
}>((set) => ({
  t: 0,
  playing: false,
  speed: 30,
  setT: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}));
/** Reset interaction state when identity changes; server records live only in Query. */
export function resetStores() {
  useDashboard.setState(useDashboard.getInitialState(), true);
  useMap.setState(useMap.getInitialState(), true);
  useRouteEditor.setState(useRouteEditor.getInitialState(), true);
  useWorkoutBuilder.setState(useWorkoutBuilder.getInitialState(), true);
  useComparison.setState(useComparison.getInitialState(), true);
  useInteraction.setState(useInteraction.getInitialState(), true);
  useGhostPlayback.setState(useGhostPlayback.getInitialState(), true);
}
