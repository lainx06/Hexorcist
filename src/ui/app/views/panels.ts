// Campaign fields (tries and seed) and the shared copy names.
// The header and the Details_Switch live in hero.ts; the setup lives in setup.ts; the fields below
// are mounted in the Details tab only (tabs.setFields).
import { SHRINK_LABEL, UI_COPY } from "../model/ui-copy";
import { checkRuns, checkSeed } from "../model/fields";
import { el } from "./dom";

// UI_COPY and SHRINK_LABEL live in model/ui-copy.ts so that model files never import a view.
// They are re-exported here under the same names.
export { SHRINK_LABEL, UI_COPY };

export interface ControlsView {
  node: HTMLElement;
  values(): { runsOk: boolean; seedOk: boolean; runs: number; seed: number };
  onFieldChange(fn: () => void): void;
  /** Sets both fields to an Example's defaults and refreshes their messages. */
  setValues(runs: number, seed: number): void;
}

export function controls(defaultRuns: number, defaultSeed: number): ControlsView {
  const runs = el("input", {
    id: "runs-field",
    class: "field mono",
    type: "text",
    inputmode: "numeric",
    value: String(defaultRuns),
    "aria-describedby": "runs-msg",
  });
  const seed = el("input", {
    id: "seed-field",
    class: "field mono",
    type: "text",
    inputmode: "numeric",
    value: String(defaultSeed),
    "aria-describedby": "seed-msg",
  });
  const runsMsg = el("p", { id: "runs-msg", class: "field-msg meta" }, [""]);
  const seedMsg = el("p", { id: "seed-msg", class: "field-msg meta" }, [""]);
  let listeners: (() => void)[] = [];

  const check = () => {
    const r = checkRuns(runs.value);
    const s = checkSeed(seed.value);
    runsMsg.textContent = r.ok ? "" : r.message;
    seedMsg.textContent = s.ok ? "" : s.message;
    return { runsOk: r.ok, seedOk: s.ok, runs: r.ok ? r.value : 0, seed: s.ok ? s.value : 0 };
  };
  for (const f of [runs, seed]) f.addEventListener("input", () => listeners.forEach((fn) => fn()));

  const node = el("section", { class: "panel", "aria-label": UI_COPY.campaignHeading }, [
    el("div", { class: "field-row" }, [el("label", { for: "runs-field" }, [UI_COPY.runsLabel]), runs, runsMsg]),
    el("div", { class: "field-row" }, [el("label", { for: "seed-field" }, [UI_COPY.seedLabel]), seed, seedMsg]),
  ]);

  return {
    node,
    values: check,
    onFieldChange(fn) {
      listeners = [...listeners, fn];
    },
    setValues(r, s) {
      runs.value = String(r);
      seed.value = String(s);
      check();
    },
  };
}

// Pinned by tests/ui/copy-scan.test.ts, which scans both strings with the word lists.
export const MINIMALITY_TOOLTIP = "1-minimal by deletion: removing any one of these events stops this failure.";
export const BUDGET_TEXT = "The reducer stopped at its budget; removing one event may still break the rule.";
