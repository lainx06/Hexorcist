// Example_Gallery: three Example_Cards. Callbacks and state setters only; the page owns the state.
import { EXAMPLE_IDS } from "../data/examples";
import type { ExampleId, FileProblem } from "../data/examples";
import { EXAMPLE_COPY } from "../model/example-copy";
import { el, setChildren } from "./dom";

export interface GalleryView {
  node: HTMLElement;
  /** Marks one card as the Current_Example (aria-pressed, amber border). */
  setSelected(id: ExampleId): void;
  /** While busy, every card that is not selected is disabled. */
  setBusy(busy: boolean): void;
  /** Lists each failing file with its reasons; an empty list clears the problems. */
  setProblems(problems: readonly FileProblem[]): void;
}

export function gallery(onSelect: (id: ExampleId) => void): GalleryView {
  let selected: ExampleId = "crosswalk";
  let busy = false;
  const cards = new Map<ExampleId, HTMLButtonElement>();
  for (const id of EXAMPLE_IDS) {
    const btn = el("button", { type: "button", class: "example-card", "aria-pressed": "false", "data-example": id }, [
      el("span", { class: "card-title" }, [EXAMPLE_COPY[id].card]),
    ]);
    btn.addEventListener("click", () => {
      if (id === selected || busy) return;
      onSelect(id);
    });
    cards.set(id, btn);
  }
  const problems = el("div", { class: "file-problems", "aria-live": "polite" });
  const node = el("div", { class: "gallery-wrap" }, [el("div", { class: "gallery" }, [...cards.values()]), problems]);

  const paint = (): void => {
    for (const [id, btn] of cards) {
      const on = id === selected;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      btn.disabled = busy && !on;
    }
  };
  paint();

  return {
    node,
    setSelected(id) {
      selected = id;
      paint();
    },
    setBusy(b) {
      busy = b;
      paint();
    },
    setProblems(list) {
      setChildren(
        problems,
        list.map((p) =>
          el("div", { class: "file-problem" }, [
            el("p", { class: "mono file-problem-name" }, [p.file]),
            el(
              "ul",
              {},
              p.reasons.map((r) => el("li", { class: "file-problem-reason" }, [r])),
            ),
          ]),
        ),
      );
    },
  };
}
