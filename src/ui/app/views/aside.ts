// Aside: the verdict card, the Reduction_Card and the one primary button "See the fix work →".
// The button shows only when the Reducer ended with a result, so never on a reduce error, HELD or
// COULDN'T TELL (those states have no reduction result). Copy comes from model/stage-copy.ts.
import { REDUCTION_TEXT, reductionCard } from "../model/stage-copy";
import type { ReductionInput } from "../model/stage-copy";
import { techOnly } from "./details";
import { el, setChildren } from "./dom";

export interface AsideState {
  /** The verdict card, or null for none. */
  card: HTMLElement | null;
  /** The reduction outcome, or null while no reduction has ended (idle, running, reducing). */
  reduction: ReductionInput | null;
  /** Disables "See the fix work →" while a job runs. */
  fixBusy?: boolean;
  /** Upload_Device: there is no fixed build, so no "See the fix work →" button is built. */
  noFix?: boolean;
}

export interface AsideView {
  root: HTMLElement;
  /**
   * Holds "See the fix work →". The stage mounts it beside `root`, not inside it, so that at Phone_Width
   * (where the aside wrapper is flattened) the button can follow the Player as the layout order requires.
   */
  actions: HTMLElement;
  render(state: AsideState): void;
  /** Registers the handler of "See the fix work →". */
  onSeeFix(cb: () => void): void;
  /** The primary button when it is shown, else null. */
  fixButton(): HTMLButtonElement | null;
}

/** "<X> moves → <Y> needed" with the "<Y> needed" part in its own span (pumpkin); the text is unchanged. */
function countParts(summary: string): (string | HTMLElement)[] {
  const at = summary.indexOf(" \u2192 ");
  if (at < 0) return [summary];
  return [summary.slice(0, at + 3), el("span", { class: "reduction-needed" }, [summary.slice(at + 3)])];
}

/** The Reduction_Card for a reduction outcome. */
export function reductionCardView(r: ReductionInput): HTMLElement {
  const t = reductionCard(r);
  if ("error" in t) {
    return el("section", { class: "card reduction-card", "aria-label": "Shrink result" }, [
      el("p", { class: "reduction-error", role: "alert" }, [t.error]),
    ]);
  }
  return el("section", { class: "card reduction-card", "aria-label": "Shrink result" }, [
    el("p", { class: "reduction-count" }, countParts(t.summary)),
    // The "smallest replay" line is a technical detail: it shows only with technical details on.
    techOnly(el("p", { class: "reduction-smallest" }, [t.smallest])),
    el("p", { class: "reduction-note meta" }, [t.note]),
  ]);
}

export function createAside(): AsideView {
  const root = el("div", { class: "aside" });
  const actions = el("div", { class: "stage-actions aside-actions", hidden: true });
  let handler: (() => void) | null = null;
  let button: HTMLButtonElement | null = null;

  return {
    root,
    actions,
    render(state) {
      button = null;
      const children: (HTMLElement | null)[] = [state.card];
      let action: HTMLElement | null = null;
      if (state.reduction !== null) {
        children.push(reductionCardView(state.reduction));
        if (state.reduction.ok && state.noFix !== true) {
          const b = el("button", { type: "button", class: "primary aside-fix" }, [REDUCTION_TEXT.seeFix]);
          b.disabled = state.fixBusy === true;
          b.addEventListener("click", () => {
            if (handler !== null) handler();
          });
          button = b;
          action = b;
        }
      }
      setChildren(root, children);
      setChildren(actions, [action]);
      actions.hidden = action === null;
    },
    onSeeFix(cb) {
      handler = cb;
    },
    fixButton: () => button,
  };
}
