// Gremlin_Picker: one chip per Compatible gremlin, and a link that lists the others as disabled chips
// with their plain reasons. Callbacks and state setters only; the page owns the selection.
import { GREMLIN_CATALOGUE } from "../../../engine/gremlins/catalogue";
import type { Fixture } from "../../../engine/types";
import { pickerTile } from "../model/gremlin-picker";
import type { PickerTile } from "../model/gremlin-picker";
import { moreNeedText } from "../model/stage-copy";
import { el, setChildren } from "./dom";
import { gremlinIcon } from "./icons";

export const PICKER_COPY = {
  title: "Gremlins",
  ranges: "Synthetic input ranges",
  pickOne: "Pick at least one gremlin.",
  mark: "\u2713",
} as const;

export interface PickerView {
  /** The chip row, the "N more need other inputs" link, the disabled list and the message. */
  node: HTMLElement;
  /** Rebuilds the chips for a fixture and sets the selected ids. */
  setFixture(fixture: Fixture, selected: readonly string[]): void;
  setSelected(selected: readonly string[]): void;
  setBusy(busy: boolean): void;
}

interface Chip {
  tile: PickerTile;
  btn: HTMLButtonElement;
  mark: HTMLElement;
}

const iconNameOf = (id: string): string => GREMLIN_CATALOGUE.find((d) => d.id === id)?.iconName ?? "";

export function picker(onToggle: (id: string) => void): PickerView {
  const row = el("div", { class: "chip-row" });
  const more = el("button", { type: "button", class: "more-link", "aria-expanded": "false", hidden: true });
  const list = el("ul", { class: "incompatible-list", hidden: true });
  const message = el("p", { class: "field-msg pick-msg", "aria-live": "polite" });
  const node = el("div", { class: "picker" }, [row, more, list, message]);
  let chips: Chip[] = [];
  let selected: string[] = [];
  let busy = false;
  let listOpen = false;

  const paint = (): void => {
    for (const c of chips) {
      const on = selected.includes(c.tile.id);
      c.btn.setAttribute("aria-pressed", on ? "true" : "false");
      c.btn.classList.toggle("is-selected", on);
      c.mark.textContent = on ? PICKER_COPY.mark : "";
      c.btn.disabled = busy;
    }
    more.disabled = busy;
    more.setAttribute("aria-expanded", listOpen ? "true" : "false");
    list.hidden = !listOpen || list.childElementCount === 0;
    message.textContent = selected.length === 0 ? PICKER_COPY.pickOne : "";
  };

  more.addEventListener("click", () => {
    if (busy) return;
    listOpen = !listOpen;
    paint();
  });

  return {
    node,
    setFixture(fixture, sel) {
      selected = [...sel];
      listOpen = false;
      const tiles = GREMLIN_CATALOGUE.map((def) => pickerTile(def, fixture));
      chips = tiles
        .filter((t) => t.compatible)
        .map((tile) => {
          const mark = el("span", { class: "chip-check", "aria-hidden": "true" }, [""]);
          const btn = el("button", { type: "button", class: "chip", "aria-pressed": "false", "data-gremlin": tile.id }, [
            gremlinIcon(iconNameOf(tile.id)),
            el("span", { class: "chip-name" }, [tile.name]),
            mark,
          ]);
          btn.addEventListener("click", () => {
            if (!busy) onToggle(tile.id);
          });
          return { tile, btn, mark };
        });
      const others = tiles.filter((t) => !t.compatible);
      setChildren(
        row,
        chips.map((c) => c.btn),
      );
      setChildren(
        list,
        others.map((t) =>
          el("li", { class: "incompatible-item" }, [
            el("button", { type: "button", class: "chip is-incompatible", disabled: true, "data-gremlin": t.id }, [
              gremlinIcon(iconNameOf(t.id), { dimmed: true }),
              el("span", { class: "chip-name" }, [t.name]),
            ]),
            el("span", { class: "meta pick-reason" }, [t.reason ?? ""]),
          ]),
        ),
      );
      more.hidden = others.length === 0;
      more.textContent = others.length === 0 ? "" : moreNeedText(others.length);
      paint();
    },
    setSelected(sel) {
      selected = [...sel];
      paint();
    },
    setBusy(b) {
      busy = b;
      paint();
    },
  };
}
