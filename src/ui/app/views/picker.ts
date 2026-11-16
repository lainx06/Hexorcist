// Gremlin_Picker: six toggle tiles in catalogue order, one per row. Callbacks and state setters only.
import { GREMLIN_CATALOGUE } from "../../../engine/gremlins/catalogue";
import type { Fixture } from "../../../engine/types";
import { pickerTile } from "../model/gremlin-picker";
import type { PickerTile } from "../model/gremlin-picker";
import { friendlyLabel } from "../model/labels";
import { signalLabel, techOnly } from "./details";
import { el, setChildren } from "./dom";

export const PICKER_COPY = {
  title: "Gremlins",
  ranges: "Synthetic input ranges",
  pickOne: "Pick at least one gremlin.",
  mark: "\u2713",
} as const;

export interface PickerView {
  node: HTMLElement;
  /** Rebuilds the six tiles for a fixture and sets the selected ids. */
  setFixture(fixture: Fixture, selected: readonly string[]): void;
  setSelected(selected: readonly string[]): void;
  setBusy(busy: boolean): void;
}

export function picker(onToggle: (id: string) => void): PickerView {
  const grid = el("div", { class: "pick-grid" });
  const message = el("p", { class: "field-msg pick-msg", "aria-live": "polite" });
  const node = el("section", { class: "panel", "aria-labelledby": "picker-title" }, [
    el("h2", { class: "region-title", id: "picker-title" }, [PICKER_COPY.title]),
    grid,
    message,
  ]);
  let tiles: { tile: PickerTile; btn: HTMLButtonElement; mark: HTMLElement }[] = [];
  let selected: string[] = [];
  let busy = false;

  const paint = (): void => {
    for (const t of tiles) {
      const on = t.tile.compatible && selected.includes(t.tile.id);
      t.btn.setAttribute("aria-pressed", on ? "true" : "false");
      t.btn.classList.toggle("is-selected", on);
      t.mark.hidden = !on;
      t.btn.disabled = !t.tile.compatible || busy;
    }
    message.textContent = selected.length === 0 ? PICKER_COPY.pickOne : "";
  };

  return {
    node,
    setFixture(fixture, sel) {
      selected = [...sel];
      tiles = GREMLIN_CATALOGUE.map((def) => {
        const tile = pickerTile(def, fixture);
        const signals = fixture.pins.map((p) => p.signal).filter((s) => tile.targets.includes(friendlyLabel(s).text));
        const mark = el("span", { class: "pick-mark", "aria-hidden": "true" }, [PICKER_COPY.mark]);
        const btn = el(
          "button",
          { type: "button", class: tile.compatible ? "pick-tile" : "pick-tile is-incompatible", "aria-pressed": "false", "data-gremlin": tile.id },
          [
          el("span", { class: "tile-head" }, [el("span", { class: "tile-name" }, [tile.name]), mark]),
          tile.compatible ? el("span", { class: "meta pick-line" }, [tile.behaviour]) : null,
          tile.compatible
            ? el("span", { class: "meta pick-line pick-targets" }, signals.map((s) => signalLabel(s)))
            : el("span", { class: "pick-reason" }, [tile.reason ?? ""]),
          tile.compatible && tile.ranges.length > 0
            ? techOnly(
                el("span", { class: "meta mono pick-ranges" }, [
                  el("span", { class: "pick-ranges-title" }, [PICKER_COPY.ranges]),
                  ...tile.ranges.map((r) => el("span", { class: "pick-range" }, [r])),
                ]),
              )
            : null,
          ],
        );
        btn.addEventListener("click", () => {
          if (tile.compatible && !busy) onToggle(tile.id);
        });
        return { tile, btn, mark };
      });
      setChildren(
        grid,
        tiles.map((t) => t.btn),
      );
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
