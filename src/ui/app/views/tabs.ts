// Tabs under the Stage: What happened, Signals, The fix, Details. Always shown.
// role=tablist / tab / tabpanel, aria-selected on the selected tab only, roving tabindex, Left and Right wrap
// (model/tabs.ts). The 150 ms cross-fade is a CSS animation that restarts when a panel stops being hidden;
// Reduced_Motion turns it into one step in app.css. "What happened" and "Signals" show the idle text until
// a replay exists. The scrubber and "Jump to the break" live inside the Timeline, which only the Signals tab holds; they move the\n// stage Playback cursor and follow it. The Timeline has no player of its own.
import { GREMLIN_CATALOGUE } from "../../../engine/gremlins/catalogue";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import type { ExampleId } from "../data/examples";
import { ms } from "../model/format";
import { PICKER_TEXT } from "../model/gremlin-picker";
import { GREMLIN_LEGEND } from "../model/labels";
import { distinctGremlinIds, movePhrase } from "../model/moves";
import { STAGE_TEXT, TAB_TEXT, legendLines } from "../model/stage-copy";
import { tabAfterKey, tabIndexes } from "../model/tabs";
import { EXAMPLE_LABELS, labelOf } from "../model/signal-labels";
import type { SignalLabels } from "../model/signal-labels";
import { UPLOAD_COPY } from "../model/upload-copy";
import { EMPTY_TRACE_TEXT, traceRows } from "../model/verdict-text";
import { plainOnly, techOnly } from "./details";
import { el, setChildren } from "./dom";
import { createFixTab } from "./fix-view";
import { gremlinIcon } from "./icons";
import type { TimelineView } from "./timeline";

/** Strings of the Replay-again row. They are the strings the page has always shown. */
export const REPLAY_AGAIN = {
  button: "Replay again",
  /** "Fingerprint <fp> · matches" or "· differs". */
  line: (fingerprint: string, same: boolean): string => `Fingerprint ${fingerprint} \u00b7 ${same ? "matches" : "differs"}`,
} as const;

export interface ReplayAgainRow {
  row: HTMLElement;
  button: HTMLButtonElement;
  out: HTMLElement;
}

/** The Replay-again row: the button and the line that follows it. Enabling follows `canReplayAgain`. */
export function createReplayAgainRow(): ReplayAgainRow {
  const button = el("button", { type: "button", class: "secondary" }, [REPLAY_AGAIN.button]);
  const out = el("p", { class: "mono meta replay-again-out" }, [""]);
  const row = el("div", { class: "replay-again" }, [button, out]);
  return { row, button, out };
}

/** Everything the "What happened" and Details tabs show about one replay. */
export interface ReplayTabData {
  /** The Plain_Story, or null while it is still being worked out. */
  story: string | null;
  /** The Reduced_List. */
  list: readonly ReducerEvent[];
  fixture: Fixture;
  /** The Exact_Story, or null when there is none. */
  exactStory: string | null;
  /** Canonical_Sentence of each rule in the rule set. */
  canonical: readonly string[];
  /** Where signal names come from; default the Example tables. */
  labels?: SignalLabels;
}

export interface TabsView {
  root: HTMLElement;
  /** The Timeline the Signals tab holds. */
  timeline: TimelineView;
  /** The Replay-again row of the Details tab. */
  replayAgain: ReplayAgainRow;
  select(index: number, focus?: boolean): void;
  selected(): number;
  tabButtons(): readonly HTMLElement[];
  panels(): readonly HTMLElement[];
  /** A replay exists (data) or not (null: idle text in "What happened" and "Signals"). */
  setReplay(data: ReplayTabData | null): void;
  /**
   * While something broke and the replay is not ready yet (the BROKE card says "Working out what happened…"),
   * "What happened" and "Signals" say the same instead of "Nothing has broken yet.".
   */
  setPending(pending: boolean): void;
  /** A verdict with no replay (COULDN'T TELL): this text replaces "Nothing has broken yet."; null restores it. */
  setNoReplayNote(text: string | null): void;
  /**
   * "The fix" while the Fix_View is open: the explanation and a button to the "What the fix changed" panel, which
   * is the one place the code change shows. Null shows "Press See the fix work to compare.".
   */
  setFixChange(id: ExampleId | null, onOpenCode?: () => void): void;
  /** Cycles_Rate_Text of the Details tab; null shows none (Technical_View only). */
  setCyclesRate(text: string | null): void;
  /** The tries and seed fields (Technical_View only); null removes them. */
  setFields(node: HTMLElement | null): void;
  /** The "Try removing a move" list (Technical_View only); null removes it. */
  setTryRemoving(node: HTMLElement | null): void;
  /** Enables or disables "Replay again" (the page passes `canReplayAgain(flow)`). */
  setReplayAgainEnabled(enabled: boolean): void;
  /** Upload_Device: "The fix" shows only that there is no fixed version to compare. */
  setNoFix(on: boolean): void;
  /** The "Gremlin order: ..." line of the Details tab (Technical_View only); null removes it. */
  setGremlinOrder(line: string | null): void;
  /** Mounts the Capability_Panel at the end of the Details tab, for every device. */
  setCapability(node: HTMLElement | null): void;
}

let instance = 0;

const EXACT_HEADING = "Exact story";
const CANONICAL_HEADING = "Rule";

function iconNameOf(id: string): string {
  return GREMLIN_CATALOGUE.find((d) => d.id === id)?.iconName ?? "";
}

function legendList(list: readonly ReducerEvent[]): HTMLElement | null {
  const ids = distinctGremlinIds(list).filter((id) => Object.prototype.hasOwnProperty.call(GREMLIN_LEGEND, id));
  const lines = legendLines(list);
  if (lines.length === 0) return null;
  return el(
    "ul",
    { class: "legend-lines" },
    lines.map((line, i) => el("li", { class: "legend-line" }, [gremlinIcon(iconNameOf(ids[i] as string)), el("span", {}, [line])])),
  );
}

function nameOf(id: string): string {
  return Object.prototype.hasOwnProperty.call(PICKER_TEXT, id) ? (PICKER_TEXT[id] as { name: string }).name : id;
}

function table(label: string, head: readonly string[], rows: readonly (readonly string[])[]): HTMLElement {
  return el("table", { class: "trace-table mono", "aria-label": label }, [
    el("thead", {}, [el("tr", {}, head.map((h) => el("th", { scope: "col" }, [h])))]),
    el(
      "tbody",
      {},
      rows.map((r) => el("tr", {}, r.map((c) => el("td", {}, [c])))),
    ),
  ]);
}

/** Gremlin_Log: Time · Move · Gremlin, and in the Technical_View Time · Signal · Value · Gremlin. */
function gremlinLog(list: readonly ReducerEvent[], fixture: Fixture, labels: SignalLabels = EXAMPLE_LABELS): HTMLElement[] {
  if (list.length === 0) return [el("p", { class: "meta" }, [EMPTY_TRACE_TEXT])];
  const plainRows: string[][] = [];
  list.forEach((e, i) => {
    if (e.gremlinId !== "rest") plainRows.push([ms(e.cycle), movePhrase(list, i, fixture, labels), nameOf(e.gremlinId)]);
  });
  // Upload (D6): "<Plain name> (<Signal name>)", or the signal name when the plain name is blank.
  const signalCell = (s: string): string => {
    if (labels.kind === "example") return s;
    const f = labelOf(labels, s);
    return f.known ? `${f.text} (${s})` : s;
  };
  const techRows = traceRows(list).map((r) => [r.time, signalCell(r.signal), r.value, r.gremlin]);
  return [
    plainOnly(table("Gremlin log", ["Time", "Move", "Gremlin"], plainRows)),
    techOnly(table("Gremlin log, signals", ["Time", "Signal", "Value", "Gremlin"], techRows)),
  ];
}

export function createTabs(timeline: TimelineView, replayAgain: ReplayAgainRow = createReplayAgainRow()): TabsView {
  const uid = `tabs-${String(instance++)}`;
  const count = TAB_TEXT.names.length;
  let current = 0;
  let hasReplay = false;
  let replayData: ReplayTabData | null = null;

  const tabEls = TAB_TEXT.names.map((name, i) =>
    el("button", { type: "button", role: "tab", class: "tab", id: `${uid}-tab-${String(i)}`, "aria-controls": `${uid}-panel-${String(i)}` }, [name]),
  );
  const tabList = el("div", { role: "tablist", class: "tablist", "aria-label": "Details of the run" }, tabEls);
  const panelEls = TAB_TEXT.names.map((_, i) =>
    el("div", { role: "tabpanel", class: "tab-panel", id: `${uid}-panel-${String(i)}`, "aria-labelledby": `${uid}-tab-${String(i)}`, tabindex: 0 }),
  );

  // What happened
  const happenedIdle = el("p", { class: "tab-idle" }, [TAB_TEXT.idle]);
  let pending = false;
  let noReplayNote: string | null = null;
  const happenedBody = el("div", { class: "happened-body" });

  // Signals
  const signalsIdle = el("p", { class: "tab-idle" }, [TAB_TEXT.idle]);

  // The fix
  const fixHost = el("div", { class: "fix-tab-body" }, [el("p", { class: "tab-idle" }, [TAB_TEXT.fixNotRun])]);

  // Details
  const fieldsHost = techOnly(el("div", { class: "details-fields" }));
  const orderLine = techOnly(el("div", { class: "gremlin-order" }));
  let noFix = false;
  const rateText = el("p", { class: "cycles-rate meta mono", hidden: true }, [""]);
  const rateLine = techOnly(el("div", { class: "details-rate" }, [rateText]));
  const canonicalHost = el("div", { class: "details-canonical" });
  const logHost = el("div", { class: "details-log" });
  const exactHost = el("div", { class: "details-exact" });
  const tryHost = el("div", { class: "details-try" });
  const replayRow = techOnly(el("div", { class: "details-replay-again" }, [replayAgain.row]));
  const capabilityHost = el("div", { class: "details-capability" });

  setChildren(panelEls[0] as HTMLElement, [happenedIdle, happenedBody]);
  setChildren(panelEls[1] as HTMLElement, [signalsIdle, timeline.node]);
  setChildren(panelEls[2] as HTMLElement, [fixHost]);
  setChildren(panelEls[3] as HTMLElement, [fieldsHost, orderLine, rateLine, canonicalHost, logHost, exactHost, tryHost, replayRow, capabilityHost]);
  const root = el("section", { class: "tabs", "aria-label": "Run details" }, [tabList, ...panelEls]);

  function paintSelection(): void {
    const idx = tabIndexes(current, count);
    tabEls.forEach((t, i) => {
      if (i === current) t.setAttribute("aria-selected", "true");
      else t.removeAttribute("aria-selected");
      t.setAttribute("tabindex", String(idx[i]));
    });
    // A panel that stops being hidden restarts its CSS cross-fade.
    panelEls.forEach((p, i) => {
      p.hidden = i !== current;
    });
  }

  function paintReplay(): void {
    const d = replayData;
    const idleText = pending ? STAGE_TEXT.storyPlaceholder : (noReplayNote ?? TAB_TEXT.idle);
    happenedIdle.textContent = idleText;
    signalsIdle.textContent = idleText;
    happenedIdle.hidden = hasReplay;
    happenedBody.hidden = !hasReplay;
    signalsIdle.hidden = hasReplay;
    timeline.node.hidden = !hasReplay;
    if (d === null) {
      setChildren(happenedBody, []);
      setChildren(canonicalHost, []);
      setChildren(logHost, []);
      setChildren(exactHost, []);
      return;
    }
    const legend = legendList(d.list);
    setChildren(happenedBody, [
      d.story === null
        ? el("p", { class: "story-text story-pending meta" }, [STAGE_TEXT.storyPlaceholder])
        : el("p", { class: "story-text" }, [d.story]),
      legend,
    ]);
    setChildren(
      canonicalHost,
      d.canonical.length === 0
        ? []
        : [
            techOnly(
              el("div", { class: "canonical" }, [
                el("h3", { class: "region-title" }, [CANONICAL_HEADING]),
                ...d.canonical.map((s) => el("p", { class: "canonical-sentence mono" }, [s])),
              ]),
            ),
          ],
    );
    setChildren(logHost, gremlinLog(d.list, d.fixture, d.labels));
    setChildren(
      exactHost,
      d.exactStory === null
        ? []
        : [
            techOnly(
              el("div", { class: "exact-story" }, [
                el("h3", { class: "region-title" }, [EXACT_HEADING]),
                el("p", { class: "story-text mono" }, [d.exactStory]),
              ]),
            ),
          ],
    );
  }

  tabEls.forEach((t, i) => {
    t.addEventListener("click", () => select(i, false));
    t.addEventListener("keydown", (e: KeyboardEvent) => {
      const next = tabAfterKey(i, e.key, count);
      if (next === i && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      select(next, true);
    });
  });

  function select(index: number, focus = false): void {
    current = Math.min(count - 1, Math.max(0, Math.trunc(index)));
    paintSelection();
    if (focus) (tabEls[current] as HTMLElement).focus();
  }

  paintSelection();
  paintReplay();
  replayAgain.button.disabled = true;

  return {
    root,
    timeline,
    replayAgain,
    select,
    selected: () => current,
    tabButtons: () => tabEls,
    panels: () => panelEls,
    setReplay(data) {
      replayData = data;
      hasReplay = data !== null;
      paintReplay();
    },
    setPending(on) {
      pending = on;
      paintReplay();
    },
    setNoReplayNote(text) {
      noReplayNote = text;
      paintReplay();
    },
    setFixChange(id, onOpenCode = () => undefined) {
      if (noFix) {
        setChildren(fixHost, [el("p", { class: "tab-idle" }, [UPLOAD_COPY.noFix])]);
        return;
      }
      setChildren(fixHost, [id === null ? el("p", { class: "tab-idle" }, [TAB_TEXT.fixNotRun]) : createFixTab(id, onOpenCode)]);
    },
    setCyclesRate(text) {
      rateText.textContent = text ?? "";
      rateText.hidden = text === null;
    },
    setFields(node) {
      setChildren(fieldsHost, node === null ? [] : [node]);
    },
    setTryRemoving(node) {
      setChildren(tryHost, node === null ? [] : [techOnly(node)]);
    },
    setReplayAgainEnabled(enabled) {
      replayAgain.button.disabled = !enabled;
    },
    setNoFix(on) {
      noFix = on;
      setChildren(fixHost, [el("p", { class: "tab-idle" }, [on ? UPLOAD_COPY.noFix : TAB_TEXT.fixNotRun])]);
    },
    setCapability(node) {
      setChildren(capabilityHost, node === null ? [] : [node]);
    },
    setGremlinOrder(line) {
      // The host is techOnly, so the Plain_View never shows the line.
      setChildren(orderLine, line === null ? [] : [el("p", { class: "meta gremlin-order-line" }, [line])]);
    },
  };
}
