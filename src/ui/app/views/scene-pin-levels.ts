// Pin_Levels_View: the scene of the Upload_Device. Inputs on the left, output lamps on the right, drawn
// only from the shown replay's recorded input events and output edges at the Cursor. It is not an
// illustration, so its badge reads "Pin levels". Every text is an HTML label over the art.
import { GREMLIN_CATALOGUE } from "../../../engine/gremlins/catalogue";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import { pinLevelsAt } from "../model/pin-levels";
import type { PinLevelRow, PinLevelsState } from "../model/pin-levels";
import { PIN_LEVELS_TEXT } from "../model/upload-copy";
import { el, setChildren, svg } from "./dom";
import { gremlinIcon } from "./icons";
import type { SceneCommonOpts, SceneLabel } from "./scene-chrome";
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
  /** New rows: the art and labels are rebuilt; `node` and `frame` are replaced. */
  setRows(rows: readonly PinLevelRow[]): void;
}

const VIEW_W = 830;
const VIEW_H = 460;
const TOP = 20;
const IN_X = 110;
const OUT_X = 520;

const pitchFor = (n: number): number => Math.min(52, Math.floor(420 / Math.max(n, 1)));
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

export function createPinLevelsScene(): PinLevelsSceneView {
  let rows: readonly PinLevelRow[] = [];
  let inputs: InputDom[] = [];
  let outputs: OutputDom[] = [];
  let chrome = build();

  function build() {
    const ins = rows.filter((r) => r.role === "input");
    const outs = rows.filter((r) => r.role === "output");
    const inPitch = pitchFor(ins.length);
    const outPitch = pitchFor(outs.length);
    const parts: SVGElement[] = [];
    const labels: SceneLabel[] = [];
    inputs = ins.map((r, i) => {
      const y = TOP + inPitch * i + inPitch / 2;
      const lever = svg("line", { x1: IN_X - 14, y1: y, x2: IN_X + 14, y2: y - 10, class: "switch-lever" });
      parts.push(svg("rect", { x: IN_X - 22, y: y - 6, width: 44, height: 14, rx: 4, class: "housing" }), lever);
      const state = el("span", { class: "pin-level-state" }, [PIN_LEVELS_TEXT.notPressed]);
      labels.push({
        node: el("span", { class: "pin-level-label" }, [el("span", { class: "pin-level-name" }, [r.name]), state]),
        x: IN_X + 34,
        y,
        align: "start",
        anchor: "middle",
        maxWidth: 0.34,
      });
      const gremlin = el("span", { class: "pin-level-gremlin", hidden: true });
      labels.push({ node: gremlin, x: IN_X - 30, y, align: "end", anchor: "middle" });
      return { lever, state, gremlin, shownGremlin: null };
    });
    outputs = outs.map((r, i) => {
      const y = TOP + outPitch * i + outPitch / 2;
      const rad = Math.min(14, Math.floor(outPitch / 2) - 4);
      const lamp = svg("circle", { cx: OUT_X, cy: y, r: Math.max(rad, 4), class: "pin-lamp is-not-driven" });
      const ring = svg("circle", { cx: OUT_X, cy: y, r: Math.max(rad, 4) + 6, class: "conflict-ring", visibility: "hidden" });
      parts.push(lamp, ring);
      const state = el("span", { class: "pin-level-state" }, [PIN_LEVELS_TEXT.notDriven]);
      labels.push({
        node: el("span", { class: "pin-level-label" }, [el("span", { class: "pin-level-name" }, [r.name]), state]),
        x: OUT_X + 26,
        y,
        align: "start",
        anchor: "middle",
        maxWidth: 0.34,
      });
      return { lamp, ring, state };
    });
    const art = svg(
      "svg",
      {
        viewBox: `0 0 ${String(VIEW_W)} ${String(VIEW_H)}`,
        preserveAspectRatio: "xMidYMid meet",
        class: "scene-svg pin-levels-svg",
        role: "img",
        "aria-label": PIN_LEVELS_TEXT.badge,
      },
      [svg("g", { class: "scene-dimmable" }, parts)],
    );
    const summary = el("p", { class: "visually-hidden" }, [""]);
    const c = createChrome({ art, width: VIEW_W, height: VIEW_H, labels, below: [summary], badge: PIN_LEVELS_TEXT.badge });
    return { c, summary };
  }

  function paint(s: PinLevelsState, opts: PinLevelsOpts): void {
    s.inputs.forEach((i, k) => {
      const d = inputs[k];
      if (d === undefined) return;
      const on = i.state === "pressed";
      const y = Number(d.lever.getAttribute("y1"));
      d.lever.setAttribute("y2", String(on ? y : y - 10));
      d.lever.setAttribute("class", on ? "switch-lever is-on" : "switch-lever");
      d.state.textContent = on ? PIN_LEVELS_TEXT.pressed : PIN_LEVELS_TEXT.notPressed;
      if (i.gremlinId !== d.shownGremlin) {
        d.shownGremlin = i.gremlinId;
        const icon = i.gremlinId === null ? null : gremlinIcon(iconOf(i.gremlinId), { className: "pin-level-icon" });
        setChildren(d.gremlin, icon === null ? [] : [icon]);
        d.gremlin.hidden = icon === null;
      }
    });
    s.outputs.forEach((o, k) => {
      const d = outputs[k];
      if (d === undefined) return;
      d.lamp.setAttribute("class", o.notDriven ? "pin-lamp is-not-driven" : o.lit ? "pin-lamp is-lit" : "pin-lamp");
      d.ring.setAttribute("visibility", o.ring ? "visible" : "hidden");
      d.state.textContent = o.notDriven ? PIN_LEVELS_TEXT.notDriven : o.lit ? PIN_LEVELS_TEXT.on : PIN_LEVELS_TEXT.off;
    });
    chrome.summary.textContent = s.summary;
    chrome.c.setLine([s.summary]);
    chrome.c.apply(opts);
  }

  const view: PinLevelsSceneView = {
    node: chrome.c.node,
    frame: chrome.c.frame,
    update(edges, events, cursor, opts = {}) {
      const replay =
        opts.waiting === true
          ? null
          : { events, outputEdges: edges, v: opts.v ?? null, ringSignals: opts.ringSignals ?? [] };
      paint(pinLevelsAt(rows, replay, cursor), opts);
    },
    setRows(next) {
      rows = next;
      chrome = build();
      view.node = chrome.c.node;
      view.frame = chrome.c.frame;
      view.update([], [], 0, { waiting: true });
    },
  };
  view.update([], [], 0, { waiting: true });
  return view;
}