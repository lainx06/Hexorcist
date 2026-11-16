// Speed page at #bench: engine throughput in the Engine_Worker, compared with pinned Node values.
import type { ReducerResult } from "../../../engine/reducer/types";
import { loadCrosswalk } from "../data/crosswalk";
import { loadGarage } from "../data/garage";
import { cycles } from "../model/format";
import {
  compareFingerprint,
  compareGarage,
  cyclesPerSecond,
  PINNED_CROSSWALK_FINGERPRINT,
  secondsText,
} from "../model/speed";
import type { CampaignDoneMsg, Measure, ReduceDoneMsg, ReplayDoneMsg } from "../worker/messages";
import { el, setChildren } from "./dom";
import type { JobOutcome } from "./worker-client";
import { createEngineClient } from "./worker-client";

function errText(o: JobOutcome): string | null {
  switch (o.kind) {
    case "done":
      return null;
    case "job-error":
      return `${o.error.kind}: ${o.error.message}`;
    case "codec-error":
      return `Message from the engine worker could not be read: ${o.error.path}: ${o.error.message}`;
    case "worker-stopped":
      return `The engine worker stopped: ${o.message}`;
  }
}

function measureCells(m: Measure | null): string[] {
  if (m === null) return ["not measured", "not measured", "not measured"];
  const cps = cyclesPerSecond(m.totalCycles, m.seconds);
  return [cycles(m.totalCycles), secondsText(m.seconds), cps === null ? "not measured" : cycles(cps)];
}

export function mountSpeedPage(root: HTMLElement): void {
  const client = createEngineClient();
  const run = el("button", { type: "button", class: "primary" }, ["Run speed check"]);
  const status = el("p", { class: "meta" }, [""]);
  const body = el("tbody", {}, []);
  const table = el("table", { class: "speed-table mono" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { scope: "col" }, ["Step"]),
        el("th", { scope: "col" }, ["Total cycles"]),
        el("th", { scope: "col" }, ["Seconds"]),
        el("th", { scope: "col" }, ["Cycles/s"]),
        el("th", { scope: "col" }, ["Result"]),
        el("th", { scope: "col" }, ["Node comparison"]),
      ]),
    ]),
    body,
  ]);
  const row = (cells: string[]) => body.appendChild(el("tr", {}, cells.map((c, i) => (i === 0 ? el("th", { scope: "row" }, [c]) : el("td", {}, [c])))));

  setChildren(root, [
    el("div", { class: "page" }, [
      el("header", { class: "page-header" }, [
        el("div", { class: "brand-row" }, [
          el("h1", { class: "wordmark" }, ["Hexorcist speed check"]),
          el("p", { class: "chip-line meta mono" }, ["ATmega328P \u00b7 Browser only"]),
        ]),
        el("p", { class: "pitch" }, ["Local performance information"]),
      ]),
      el("main", { class: "panel speed" }, [
        el("p", {}, [
          "Runs the Crosswalk buggy campaign, its reduction and the reduced replay, then the Garage fixed campaign, all in the engine worker. The wall clock times the steps; results are compared with the values pinned by the Node tests.",
        ]),
        run,
        status,
        el("div", { class: "table-scroll", tabindex: 0, role: "region", "aria-label": "Speed results" }, [table]),
      ]),
    ]),
  ]);

  run.addEventListener("click", () => {
    void (async () => {
      run.disabled = true;
      setChildren(body, []);
      const cw = loadCrosswalk();
      const gr = loadGarage();
      if (!cw.ok || !gr.ok) {
        status.textContent = "The bundled example data did not load.";
        run.disabled = false;
        return;
      }
      status.textContent = "Running the Crosswalk buggy campaign";
      const c1 = await client.run({
        kind: "campaign",
        hex: cw.buggyHex,
        fixture: cw.fixture,
        ruleSet: cw.ruleSet,
        gremlinSet: cw.meta.gremlinSet,
        campaignSeed: cw.meta.campaignSeed,
        runs: cw.meta.runs,
        runCycles: cw.meta.runCycles,
        measure: true,
      });
      const e1 = errText(c1);
      const d1 = e1 === null ? (c1 as { message: CampaignDoneMsg }).message : null;
      const v1 = d1?.result.verdict ?? null;
      row(["Crosswalk buggy campaign", ...measureCells(d1?.measure ?? null), e1 ?? v1?.verdict ?? "", "-"]);

      if (d1 !== null && v1 !== null && v1.verdict === "BROKE") {
        status.textContent = "Running the Crosswalk reduction";
        const c2 = await client.run({
          kind: "reduce",
          hex: cw.buggyHex,
          fixture: cw.fixture,
          ruleSet: cw.ruleSet,
          originalList: v1.trace.eventList,
          violation: v1.trace.violation,
          runCycles: cw.meta.runCycles,
          measure: true,
        });
        const e2 = errText(c2);
        const d2: ReduceDoneMsg | null = e2 === null ? (c2 as { message: ReduceDoneMsg }).message : null;
        const res: ReducerResult | null = d2?.result ?? null;
        row([
          "Crosswalk reduction",
          ...measureCells(d2?.measure ?? null),
          e2 ?? (res === null ? "" : `${String(res.originalEventCount)} -> ${String(res.reducedEventCount)}, candidates tried: ${String(res.candidatesTried)}`),
          "-",
        ]);
        if (res !== null) {
          status.textContent = "Replaying the reduced Crosswalk trace";
          const c3 = await client.run({
            kind: "replay",
            hex: cw.buggyHex,
            fixture: cw.fixture,
            ruleSet: cw.ruleSet,
            events: res.reducedList,
            runCycles: cw.meta.runCycles,
          });
          const e3 = errText(c3);
          const fp = e3 === null ? (c3 as { message: ReplayDoneMsg }).message.fingerprint : null;
          row([
            "Crosswalk reduced replay",
            "-",
            "-",
            "-",
            e3 ?? `fingerprint ${fp ?? ""}`,
            `pinned ${PINNED_CROSSWALK_FINGERPRINT}: ${compareFingerprint(fp)}`,
          ]);
        } else {
          row(["Crosswalk reduced replay", "-", "-", "-", "not run", `pinned ${PINNED_CROSSWALK_FINGERPRINT}: differs`]);
        }
      } else {
        row(["Crosswalk reduction", "-", "-", "-", "not run: the campaign did not end BROKE", "differs"]);
        row(["Crosswalk reduced replay", "-", "-", "-", "not run", `pinned ${PINNED_CROSSWALK_FINGERPRINT}: differs`]);
      }

      status.textContent = "Running the Garage fixed campaign";
      const c4 = await client.run({
        kind: "campaign",
        hex: gr.fixedHex,
        fixture: gr.fixture,
        ruleSet: gr.ruleSet,
        gremlinSet: gr.meta.gremlinSet,
        campaignSeed: gr.meta.campaignSeed,
        runs: gr.meta.runs,
        runCycles: gr.meta.runCycles,
        measure: true,
      });
      const e4 = errText(c4);
      const d4 = e4 === null ? (c4 as { message: CampaignDoneMsg }).message : null;
      const v4 = d4?.result.verdict ?? null;
      row([
        "Garage fixed campaign",
        ...measureCells(d4?.measure ?? null),
        e4 ?? (v4 === null ? "" : v4.verdict === "HELD" ? v4.text : v4.verdict),
        `pinned HELD text for 40 runs: ${compareGarage(v4)}`,
      ]);
      status.textContent = "Done.";
      run.disabled = false;
    })();
  });
}