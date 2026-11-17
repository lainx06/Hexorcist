// Capability_Panel: "What Hexorcist can and can't check", shown in the Details tab for every device and in
// both views (it is marked neither tech nor plain). DOM builder; the content comes from model/capability.ts.
import type { Verdict } from "../../../engine/types";
import { capabilityContent } from "../model/capability";
import type { SignalLabels } from "../model/signal-labels";
import { plainOnly, techOnly } from "./details";
import { el, setChildren } from "./dom";

export interface CapabilityPanelView {
  node: HTMLElement;
  /** Repaints from the shown verdict (null: none yet) and the labels of the device it ran on. */
  update(args: { verdict: Verdict | null; labels: SignalLabels }): void;
}

const list = (items: readonly string[], ordered = false): HTMLElement =>
  el(ordered ? "ol" : "ul", { class: "capability-list" }, items.map((s) => el("li", {}, [s])));

export function createCapabilityPanel(): CapabilityPanelView {
  const node = el("section", { class: "capability-panel", "aria-labelledby": "capability-title" });
  const view: CapabilityPanelView = {
    node,
    update({ verdict, labels }) {
      const c = capabilityContent({ verdict, labels });
      setChildren(node, [
        el("h3", { class: "region-title", id: "capability-title" }, [c.title]),
        el("h4", { class: "capability-heading" }, [c.modelledHeading]),
        list(c.modelled),
        el("h4", { class: "capability-heading" }, [c.notModelledHeading]),
        el("p", { class: "meta" }, [c.notModelledLine]),
        plainOnly(list(c.notModelledPlain)),
        techOnly(list(c.notModelled)),
        ...c.lines.map((l) => el("p", { class: "capability-line" }, [l])),
        el("h4", { class: "capability-heading" }, [c.orderHeading]),
        list(c.order, true),
        c.floating === null ? null : el("h4", { class: "capability-heading" }, [c.floatingHeading]),
        c.floating === null ? null : list(c.floating),
      ]);
    },
  };
  return view;
}