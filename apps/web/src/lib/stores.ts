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
export const useRouteEditor = create<{
  dirty: boolean;
  setDirty: (v: boolean) => void;
}>((set) => ({ dirty: false, setDirty: (dirty) => set({ dirty }) }));
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
/** Reset interaction state when identity changes; server records live only in Query. */
export function resetStores() {
  useDashboard.setState(useDashboard.getInitialState(), true);
  useMap.setState(useMap.getInitialState(), true);
  useRouteEditor.setState(useRouteEditor.getInitialState(), true);
  useWorkoutBuilder.setState(useWorkoutBuilder.getInitialState(), true);
  useComparison.setState(useComparison.getInitialState(), true);
  useInteraction.setState(useInteraction.getInitialState(), true);
}
