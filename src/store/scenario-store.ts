import { create } from "zustand";

export type DiagramView = "before" | "after";

interface ScenarioPlayerState {
  /** Scenario the state belongs to; switching scenarios resets everything. */
  slug: string | null;
  rps: number;
  /** Chosen fix option id, or null before the user picks one. */
  chosen: string | null;
  view: DiagramView;
  start: (slug: string, initialRps: number) => void;
  setRps: (rps: number) => void;
  choose: (optionId: string | null) => void;
  setView: (view: DiagramView) => void;
}

export const useScenarioStore = create<ScenarioPlayerState>()((set, get) => ({
  slug: null,
  rps: 0,
  chosen: null,
  view: "before",
  start: (slug, initialRps) => {
    if (get().slug === slug) return;
    set({ slug, rps: initialRps, chosen: null, view: "before" });
  },
  setRps: (rps) => set({ rps }),
  choose: (optionId) => set({ chosen: optionId, view: optionId ? "after" : "before" }),
  setView: (view) => set({ view }),
}));
