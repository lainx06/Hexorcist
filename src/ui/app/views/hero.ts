// Header (ghost mark, wordmark, Details_Switch) and hero (h1, paragraph, three plain chips).
// After a Campaign ends the hero is removed and the header carries the tagline as small text.
import { HERO } from "../model/stage-copy";
import { UI_COPY } from "../model/ui-copy";
import { applyDetails, currentDetails, writeDetails } from "./details";
import { el } from "./dom";
import { ghostMark } from "./icons";

export interface HeroView {
  /** The header line: ghost mark, "Hexorcist", the tagline (after a Campaign) and the Details_Switch. */
  header: HTMLElement;
  /** The h1, the paragraph and the three chips. */
  hero: HTMLElement;
  /** True after a Campaign has ended: no h1, paragraph or chips, and the tagline shows in the header. */
  setCollapsed(collapsed: boolean): void;
}

/** The Details_Switch: role="switch", aria-checked, visible "Off" or "On", stored under the Details_Key. */
export function detailsSwitch(): HTMLButtonElement {
  const on0 = currentDetails();
  const state = el("span", { class: "switch-state" }, [on0 ? UI_COPY.switchOn : UI_COPY.switchOff]);
  const btn = el("button", { type: "button", class: "switch", role: "switch", "aria-checked": on0 ? "true" : "false" }, [
    el("span", { class: "switch-label" }, [UI_COPY.switchLabel]),
    state,
  ]);
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-checked") !== "true";
    btn.setAttribute("aria-checked", on ? "true" : "false");
    state.textContent = on ? UI_COPY.switchOn : UI_COPY.switchOff;
    applyDetails(btn.closest(".page") ?? document, on);
    writeDetails(on);
  });
  return btn;
}

export function createHero(): HeroView {
  const tagline = el("p", { class: "tagline meta", hidden: true }, [HERO.tagline]);
  const header = el("header", { class: "page-header" }, [
    el("div", { class: "header-bar" }, [
      el("div", { class: "brand" }, [ghostMark(), el("span", { class: "wordmark" }, ["Hexorcist"]), tagline]),
      detailsSwitch(),
    ]),
  ]);
  const hero = el("section", { class: "hero", "aria-label": "Hexorcist" }, [
    el("h1", {}, [HERO.line1, " ", el("span", { class: "hero-accent" }, [HERO.line2])]),
    el("p", { class: "hero-text" }, [HERO.paragraph]),
    el(
      "ul",
      { class: "hero-chips" },
      HERO.chips.map((c) => el("li", { class: "hero-chip" }, [c])),
    ),
  ]);
  return {
    header,
    hero,
    setCollapsed(collapsed) {
      hero.hidden = collapsed;
      tagline.hidden = !collapsed;
    },
  };
}
