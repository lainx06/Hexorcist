// Stage phase and the page flags derived from it. Pure: no DOM, no clock, no randomness.

export type StagePhase =
  | "idle"
  | "running"
  | "shrinking"
  | "broke"
  | "reduce-error"
  | "fix"
  | "held"
  | "couldnt-tell";

export interface StageFlags {
  /** The hero (h1, paragraph, chips) shows only until a Campaign has ended. */
  hero: boolean;
  /** The setup is expanded by the phase. The user may also re-expand it with "Change setup". */
  setupExpanded: boolean;
  /** Setup controls are disabled while a job runs. */
  setupLocked: boolean;
  /** The one primary button the phase offers: "Unleash gremlins" or "See the fix work \u2192". */
  primary: "unleash" | "fix" | null;
  /** "What happened" and "Signals" show the idle text while no replay exists. */
  tabsIdle: boolean;
}

/** Flags of a phase. `hasReplay` is false after load and after the example, rule or gremlin set changes. */
export function stageFlags(phase: StagePhase, hasReplay: boolean): StageFlags {
  const early = phase === "idle" || phase === "running";
  return {
    hero: early,
    setupExpanded: early,
    setupLocked: phase === "running" || phase === "shrinking",
    primary: early ? "unleash" : phase === "broke" ? "fix" : null,
    tabsIdle: !hasReplay,
  };
}
