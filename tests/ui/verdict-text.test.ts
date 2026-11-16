// Feature: bench-ui-core. Verdict card texts: exact Engine strings. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { msText } from "../../src/engine/reducer/story";
import type { Rule } from "../../src/engine/rules/ir";
import type { BrokeTrace, Verdict } from "../../src/engine/types";
import { heldText } from "../../src/engine/verdict";
import {
  brokeScope,
  cardTitle,
  couldntTellLines,
  EMPTY_TRACE_TEXT,
  observedText,
  traceRows,
  uncheckedRows,
} from "../../src/ui/app/model/verdict-text";
import { edgesArb, eventsArb, refLevel } from "./arbitraries";

const levelWord = (v: 0 | 1 | "input" | undefined) => (v === 0 ? "0" : v === 1 ? "1" : "not driven");

const HINT = {
  trigger: "Next step: adjust the stimulus (other gremlins, more runs or a longer run) so the trigger can happen.",
  floating: "Next step: review the input configuration.",
  unmapped: "Next step: map these signals to pins in the fixture.",
  hardware: "Next step: this program uses hardware this emulator does not model; check this part on a board.",
  runs: "Next step: run the campaign again.",
  gremlin: "Next step: pick gremlins that target this program's inputs.",
};

describe("verdict card text", () => {
  it("Property 7: observed values name each rule signal in order", () => {
    // Feature: bench-ui-core, Property 7: Observed values name each rule signal in order
    const rule: Rule = {
      form: "never",
      condition: { op: "all", of: [{ op: "eq", signal: "B", value: 1 }, { op: "eq", signal: "A", value: 1 }] },
    };
    fc.assert(
      fc.property(edgesArb, fc.integer({ min: 0, max: 220 }), (edges, v) => {
        const b = levelWord(refLevel(edges, "B", v, (e) => e.value));
        const a = levelWord(refLevel(edges, "A", v, (e) => e.value));
        expect(observedText(rule, v, edges)).toBe(`Observed at ${msText(v)}: B = ${b}, A = ${a}.`);
      }),
      { seed: 701, numRuns: 200 },
    );
  });

  it("Property 8: BROKE scope and trace rows", () => {
    // Feature: bench-ui-core, Property 8: BROKE scope and trace rows
    fc.assert(
      fc.property(eventsArb, fc.integer({ min: 0, max: 999 }), fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 4294967295 }), (events, runIndex, n, seed) => {
        const trace: BrokeTrace = { runIndex, runSeed: 1, eventList: events, outputEvents: [], violation: { rule: "r", cycle: 0 } };
        const s = brokeScope(trace, n, seed);
        expect(s.runText).toBe(`run ${runIndex + 1} of ${n}`);
        expect(s.seedText).toBe(`Seed: ${seed}`);
        const rows = traceRows(events);
        expect(rows).toHaveLength(events.length);
        rows.forEach((r, i) => {
          const e = events[i]!;
          expect(r.time).toBe(msText(e.cycle));
          expect(r.signal).toBe(e.signal);
          expect(r.gremlin).toBe(e.gremlinId);
          expect(r.value).toBe("analog" in e ? String(e.analog) : String(e.value));
        });
      }),
      { seed: 801, numRuns: 200 },
    );
    expect(EMPTY_TRACE_TEXT).toBe("This trace holds no input events.");
    expect(uncheckedRows([{ rule: "b", reason: "y" }, { rule: "a", reason: "x" }])).toEqual([
      { rule: "b", reason: "y" },
      { rule: "a", reason: "x" },
    ]);
  });

  it("Property 9: verdict title and HELD text come from the Engine unchanged", () => {
    // Feature: bench-ui-core, Property 9: Verdict title and HELD text come from the Engine unchanged
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (n) => {
        const v: Verdict = { verdict: "HELD", text: heldText(n), runs: n };
        expect(cardTitle(v)).toBe("HELD");
      }),
      { seed: 901, numRuns: 100 },
    );
    const broke: Verdict = {
      verdict: "BROKE",
      trace: { runIndex: 0, runSeed: 0, eventList: [], outputEvents: [], violation: { rule: "r", cycle: 0 } },
      unchecked: [],
    };
    expect(cardTitle(broke)).toBe("BROKE");
    expect(cardTitle({ verdict: "COULDN'T TELL", reason: "x" })).toBe("COULDN'T TELL");
    expect(heldText(1)).toBe("No violation found in 1 emulated run of this gremlin set. Not a proof.");
    expect(heldText(24)).toBe("No violation found in 24 emulated runs of this gremlin set. Not a proof.");
  });

  it("Property 10: COULDN'T TELL lines keep each part and add the matching hints", () => {
    // Feature: bench-ui-core, Property 10: COULDN'T TELL lines keep each part and add the matching hints
    const partArb = fc.oneof(
      fc.constantFrom(
        'Rule "x" could not be checked: trigger never happened in 3 runs',
        'Rule "x" could not be checked: input REQUEST was read while floating',
        "Signals not mapped to a pin: FOO",
        "Peripherals not supported: USART0",
        "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked.",
        "Only 3 of 24 runs completed",
        "No gremlin produced an event in any run",
        "Something else",
      ),
      fc.string({ maxLength: 20 }).filter((s) => !s.includes("; ")),
    );
    fc.assert(
      fc.property(fc.array(partArb, { minLength: 1, maxLength: 5 }), (parts) => {
        const reason = parts.join("; ");
        const lines = couldntTellLines(reason);
        expect(lines.map((l) => l.text).join("; ")).toBe(reason);
        expect(lines).toHaveLength(reason.split("; ").length);
        for (const l of lines) {
          const want: string[] = [];
          if (l.text.includes("trigger never happened")) want.push(HINT.trigger);
          if (l.text.includes("floating")) want.push(HINT.floating);
          if (l.text.startsWith("Signals not mapped to a pin")) want.push(HINT.unmapped);
          if (l.text.startsWith("Peripherals not supported") || l.text.includes("which this emulator setup does not model")) want.push(HINT.hardware);
          if (l.text.startsWith("Only ") && l.text.endsWith(" runs completed")) want.push(HINT.runs);
          if (l.text === "No gremlin produced an event in any run") want.push(HINT.gremlin);
          expect(l.hints).toEqual(want);
        }
      }),
      { seed: 1001, numRuns: 200 },
    );
  });
});