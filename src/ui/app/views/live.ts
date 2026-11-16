// The single aria-live="polite" region. Only campaign start, verdicts and the reduction end
// write to it; counters, the timer and the cursor never do.
import { el } from "./dom";

export interface LiveRegion {
  node: HTMLElement;
  announce(text: string): void;
}

export function createLiveRegion(): LiveRegion {
  const node = el("div", { "aria-live": "polite", class: "visually-hidden" });
  return {
    node,
    announce(text: string) {
      node.textContent = text;
    },
  };
}