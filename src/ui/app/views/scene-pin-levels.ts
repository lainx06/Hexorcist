// Pin_Levels_View: the scene of the Upload_Device. Inputs in a left column, output lamps in a right column,
// drawn only from the shown replay's recorded input events and output edges at the Cursor. It is not an
// illustration, so its badge reads "Pin levels". The columns are HTML laid over an empty 830 x 460 card, so
// rows centre and spread evenly, shrink to a 28 px minimum, and then scroll inside the card. Every text is
// HTML; each switch and lamp is a small SVG of its own.
import { GREMLIN_CATALOGUE } from "../../../engine/gremlins/catalogue";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import { pinLevelsAt } from "../model/pin-levels";
import type { PinLevelRow, PinLevelsState } from "../model/pin-levels";
import { PIN_LEVELS_TEXT } from "../model/upload-copy";
import { el, setChildren, svg } from "./dom";
import { gremlinIcon } from "./icons";
import type { SceneCommonOpts } from "./scene-chrome";
import { createChrome } from "./scene-chrome";

export interface PinLevelsOpts extends SceneCommonOpts {
  /** No replay is shown: every input not pressed, every output off and not driven. */
  waiting?: boolean;
  /** Break cycle; null or absent when the replay holds no violation. */
  v?: number | null;
  /** Outputs named by the Target_Rule; they get the coral ring at the break. */
  ringSignals?: readonly string[];
}

export interface PinLevelsSceneView {
  node: HTMLElement;
  frame: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: PinLevelsOpts): void;
  /** New rows: the columns are rebuilt; `node` and `frame` are replaced. */
  setRows(rows: readonly PinLevelRow[]): void;
}

const VIEW_W = 830;
const VIEW_H = 460;

const iconOf = (id: string): string => GREMLIN_CATALOGUE.find((g) => g.id === id)?.iconName ?? "";

interface InputDom {
  lever: SVGElement;
  state: HTMLElement;
  gremlin: HTMLElement;
  shownGremlin: string | null;
}
interface OutputDom {
  lamp: SVGElement;
  ring: SVGElement;
  state: HTMLElement;
}

/** A 44 px switch: a housing and a lever that sits down when pressed. */
function switchArt(): { node: SVGElement; lever: SVGElement } {
  const lever = svg("line", { x1: 10, y1: 22, x2: 34, y2: 12, class: "switch-lever" });
  const node = svg("svg", { viewBox: "0 0 44 44", class: "pin-switch", "aria-hidden": "true", focusable: "false" }, [
    svg("rect", { x: 4, y: 20, width: 36, height: 14, rx: 4, class: "housing" }),
    lever,
  ]);
  return { node, lever };
}

/** A 36 px lamp with the coral ring around it. */
function lampArt(): { node: SVGElement; lamp: SVGElement; ring: SVGElement } {
  const lamp = svg("circle", { cx: 18, cy: 18, r: 11, class: "pin-lamp is-not-driven" });
  const ring = svg("circle", { cx: 18, cy: 18, r: 16, class: "conflict-ring", visibility: "hidden" });
  const node = svg("svg", { viewBox: "0 0 36 36", class: "pin-lamp-art", "aria-hidden": "true", focusable: "false" }, [lamp, ring]);
  return { node, lamp, ring };
}

const rowText = (name: string, state: HTMLElement): HTMLElement =>
  el("span", { class: "pin-level-text" }, [el("span", { class: "pin-level-name" }, [name]), state]);

export function createPinLevelsScene(): PinLevelsSceneView {
  let rows: readonly PinLevelRow[] = [];
  let inputs: InputDom[] = [];
  let outputs: OutputDom[] = [];
  let built = build();

  function build() {
    const ins = rows.filter((r) => r.role === "input");
    const outs = rows.filter((r) => r.role === "output");
    inputs = [];
    outputs = [];
    const inRows = ins.map((r) => {
      const sw = switchArt();
      const state = el("span", { class: "pin-level-state" }, [PIN_LEVELS_TEXT.notPressed]);
      // The gremlin slot is always there, 28 px wide, so the switches line up with or without a gremlin.
      const gremlin = el("span", { class: "pin-level-gremlin" });
      inputs.push({ lever: sw.lever, state, gremlin, shownGremlin: null });
      return el("li", { class: "pin-level-row" }, [gremlin, sw.node, rowText(r.name, state)]);
    });
    const outRows = outs.map((r) => {
      const lp = lampArt();
      const state = el("span", { class: "pin-level-state" }, [PIN_LEVELS_TEXT.notDriven]);
      outputs.push({ lamp: lp.lamp, ring: lp.ring, state });
      return el("li", { class: "pin-level-row" }, [lp.node, rowText(r.name, state)]);
    });
    const column = (cls: string, items: HTMLElement[]): HTMLElement =>
      el("div", { class: `pin-level-col ${cls}` }, [el("ol", { class: "pin-level-list" }, items)]);
    const columns = el("div", { class: "pin-levels-columns" }, [
      column("pin-level-col--in", inRows),
      column("pin-level-col--out", outRows),
    ]);
    // An empty art of the card's size keeps the 830 x 460 shape; the columns lie over it.
    const art = svg("svg", {
      viewBox: `0 0 ${String(VIEW_W)} ${String(VIEW_H)}`,
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg pin-levels-svg",
      role: "img",
      "aria-label": PIN_LEVELS_TEXT.badge,
    });
    const summary = el("p", { class: "visually-hidden" }, [""]);
    const c = createChrome({ art, width: VIEW_W, height: VIEW_H, labels: [], below: [summary], badge: PIN_LEVELS_TEXT.badge });
    c.frame.classList.add("pin-levels-frame");
    c.node.classList.add("pin-levels");
    c.frame.insertBefore(columns, c.frame.children[1] ?? null);
    return { c, summary };
  }

  function paint(s: PinLevelsState, opts: PinLevelsOpts): void {
    s.inputs.forEach((i, k) => {
      const d = inputs[k];
      if (d === undefined) return;
      const on = i.state === "pressed";
      d.lever.setAttribute("y2", on ? "22" : "12");
      d.lever.setAttribute("class", on ? "switch-lever is-on" : "switch-lever");
      d.state.textContent = on ? PIN_LEVELS_TEXT.pressed : PIN_LEVELS_TEXT.notPressed;
      if (i.gremlinId !== d.shownGremlin) {
        d.shownGremlin = i.gremlinId;
        const icon = i.gremlinId === null ? null : gremlinIcon(iconOf(i.gremlinId), { className: "pin-level-icon" });
        setChildren(d.gremlin, icon === null ? [] : [icon]);
      }
    });
    s.outputs.forEach((o, k) => {
      const d = outputs[k];
      if (d === undefined) return;
      d.lamp.setAttribute("class", o.notDriven ? "pin-lamp is-not-driven" : o.lit ? "pin-lamp is-lit" : "pin-lamp");
      d.ring.setAttribute("visibility", o.ring ? "visible" : "hidden");
      d.state.textContent = o.notDriven ? PIN_LEVELS_TEXT.notDriven : o.lit ? PIN_LEVELS_TEXT.on : PIN_LEVELS_TEXT.off;
    });
    built.summary.textContent = s.summary;
    built.c.setLine([s.summary]);
    built.c.apply(opts);
  }

  const view: PinLevelsSceneView = {
    node: built.c.node,
    frame: built.c.frame,
    update(edges, events, cursor, opts = {}) {
      const replay =
        opts.waiting === true ? null : { events, outputEdges: edges, v: opts.v ?? null, ringSignals: opts.ringSignals ?? [] };
      paint(pinLevelsAt(rows, replay, cursor), opts);
    },
    setRows(next) {
      rows = next;
      built = build();
      view.node = built.c.node;
      view.frame = built.c.frame;
      view.update([], [], 0, { waiting: true });
    },
  };
  view.update([], [], 0, { waiting: true });
  return view;
}
