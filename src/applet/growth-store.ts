import {create} from 'zustand';
import type {Metric, ReferencePopulation, Sex} from './growth-model';

// A plain Zustand store running INSIDE the applet worker. Nothing special is
// required: Zustand is pure JS + React's useSyncExternalStore, with no DOM,
// window, network, or storage dependencies, so it works unchanged in the
// DedicatedWorker just like any other applet computation. The store drives
// React re-renders, which Remote DOM serializes to the trusted host.
//
// Caveat for the middleware: `persist` defaults to localStorage/IndexedDB, which
// are intentionally unavailable in the opaque-origin worker — back it with a
// host capability (e.g. a brokered FHIR resource) if you need persistence.
// `devtools` no-ops without the extension global; `immer`/`subscribeWithSelector`
// are pure and work as-is.
interface GrowthViewState {
  metric: Metric;
  sex: Sex;
  population: ReferencePopulation;
  maximumAge: number;
  animating: boolean;
  setMetric: (metric: Metric) => void;
  setSex: (sex: Sex) => void;
  setPopulation: (population: ReferencePopulation) => void;
  setMaximumAge: (maximumAge: number) => void;
  startAnimation: () => void;
  advanceAnimation: () => void;
}

export const useGrowthView = create<GrowthViewState>((set) => ({
  metric: 'height',
  sex: 'female',
  population: 'general-a',
  maximumAge: 18,
  animating: false,
  setMetric: (metric) => set({metric}),
  setSex: (sex) => set({sex}),
  setPopulation: (population) => set({population}),
  setMaximumAge: (maximumAge) => set({maximumAge}),
  startAnimation: () => set({animating: true, maximumAge: 4}),
  advanceAnimation: () =>
    set((state) => {
      if (!state.animating) return state;
      if (state.maximumAge >= 18) return {animating: false, maximumAge: 18};
      return {maximumAge: state.maximumAge + 1};
    }),
}));
