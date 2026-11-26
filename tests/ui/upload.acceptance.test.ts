// Feature: bench-ui-upload. Acceptance A1 to A5 through the Upload_Model, the Message_Codec and the
// Worker_Host job functions the UI calls. Node only, no DOM, no browser.
// Passing runs are evidence, not proof.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UNMODELLED_PERIPHERALS } from "../../src/engine/peripherals";
import { loadExample } from "../../src/ui/app/data/examples";
import { defaultSelection } from "../../src/ui/app/model/gremlin-picker";
import { hexCheck } from "../../src/ui/app/model/upload-hex";
import {
  beginHexRead,
  buildCampaignRequest,
  deriveUpload,
  editRow,
  hexChosen,
  importPins,
  initialUpload,
  loadSample,
  setField,
  setRuleText,
  toggleGremlin,
  uploadReady,
} from "../../src/ui/app/model/upload-state";
import type { UploadState } from "../../src/ui/app/model/upload-state";
import { decodeDisplayRequest, decodeRequest, encodeDisplayRequest, encodeMessage } from "../../src/ui/app/worker/codec";
import { pinLevelRows, pinLevelsAt } from "../../src/ui/app/model/pin-levels";
import { runCampaignJob, runDisplayReplayJob, runReductionJob, runReplayJob } from "../../src/ui/app/worker/host";
import type { CampaignRequest, DisplayReplayRequest, ReduceRequest, ReplayRequest, WorkerRequest } from "../../src/ui/app/worker/messages";

const T = 600_000;
const ROOT = resolve(__dirname, "..", "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const bytes = (t: string): number => new TextEncoder().encode(t).length;

/** Every request goes through the codec before it reaches its job function. */
function viaCodec<R extends WorkerRequest>(req: Omit<R, "jobId">, jobId: number): R {
  const d = decodeRequest(encodeMessage({ ...req, jobId } as never));
  if (!d.ok) throw new Error(`codec: ${d.error.path}: ${d.error.message}`);
  return d.message as R;
}

function must<R extends { ok: boolean }>(r: R, who: string): Extract<R, { ok: true }> {
  if (!r.ok) {
    const e = (r as unknown as { error: { kind: string; message: string } }).error;
    throw new Error(`${who}: error kind "${e.kind}": ${e.message}`);
  }
  return r as Extract<R, { ok: true }>;
}

interface Pipeline {
  req: Omit<CampaignRequest, "jobId">;
  verdict: ReturnType<typeof runCampaign>["result"]["verdict"];
  runIndex: number | null;
  from: number | null;
  to: number | null;
  reducedList: unknown;
  fingerprint: string | null;
}

function runCampaign(req: Omit<CampaignRequest, "jobId">) {
  const c = viaCodec<CampaignRequest>(req, 1);
  return must(runCampaignJob(c), "campaign");
}

/** Campaign, then (on BROKE) the reduction and the replay of the Reduced_List, as the page runs them. */
function pipeline(s: UploadState): Pipeline {
  const req = buildCampaignRequest(s);
  if (req === null) throw new Error("buildCampaignRequest returned null: the state is not ready");
  const camp = runCampaign(req);
  const v = camp.result.verdict;
  if (v.verdict !== "BROKE") {
    return { req, verdict: v, runIndex: null, from: null, to: null, reducedList: null, fingerprint: null };
  }
  const red = viaCodec<ReduceRequest>(
    {
      kind: "reduce",
      hex: req.hex,
      fixture: req.fixture,
      ruleSet: req.ruleSet,
      originalList: v.trace.eventList,
      violation: v.trace.violation,
      runCycles: req.runCycles,
      measure: false,
    },
    2,
  );
  const reduction = must(runReductionJob(red), "reduction").result;
  const rep = viaCodec<ReplayRequest>(
    {
      kind: "replay",
      hex: req.hex,
      fixture: req.fixture,
      ruleSet: req.ruleSet,
      events: reduction.reducedList,
      runCycles: req.runCycles,
    },
    3,
  );
  const replay = must(runReplayJob(rep), "replay");
  return {
    req,
    verdict: v,
    runIndex: v.trace.runIndex,
    from: reduction.originalEventCount,
    to: reduction.reducedEventCount,
    reducedList: reduction.reducedList,
    fingerprint: replay.fingerprint,
  };
}

const sampleState = (): UploadState => loadSample(initialUpload());

function chooseHex(s: UploadState, name: string, size: number, text: string): UploadState {
  const b = beginHexRead(s);
  return hexChosen(b.state, b.token, hexCheck(name, size, text));
}

describe("A1", () => {
  it(
    "The sample path through the upload model (the same functions the UI calls) produces BROKE on try 4 of 24, reduction 8 -> 3, fingerprint 47078989121ebc1d.",
    { timeout: T },
    () => {
      const s = sampleState();
      expect(uploadReady(s, false), "the Sample state is ready").toBe(true);
      const p = pipeline(s);
      expect(p.verdict.verdict, "verdict").toBe("BROKE");
      expect(p.runIndex, "zero-based breaking run index (try 4)").toBe(3);
      expect(p.req.runs, "tries").toBe(24);
      expect(p.from, "original event count").toBe(8);
      expect(p.to, "reduced event count").toBe(3);
      expect(p.fingerprint, "reduced replay fingerprint").toBe("47078989121ebc1d");

      // Requirement 4.8: the same request as the crosswalk Example's campaign.
      const l = loadExample("crosswalk");
      if (!l.ok) throw new Error("crosswalk example did not load");
      const ex = l.example;
      expect(p.req).toEqual({
        kind: "campaign",
        hex: ex.buggyHex,
        fixture: ex.fixture,
        ruleSet: ex.ruleSet,
        gremlinSet: defaultSelection(ex.meta.gremlinSet, ex.fixture),
        campaignSeed: ex.meta.campaignSeed,
        runs: ex.meta.runs,
        runCycles: ex.meta.runCycles,
        measure: false,
      });
      expect(JSON.parse(read("examples/crosswalk/fixture.json"))).toEqual(p.req.fixture);
      expect(JSON.stringify(p.req)).not.toContain("plainName");
    },
  );

  it("a second campaign and reduction of the Sample give the same results (Requirement 18.3)", { timeout: T }, () => {
    const a = pipeline(sampleState());
    const b = pipeline(sampleState());
    expect(b.verdict.verdict).toBe(a.verdict.verdict);
    expect(b.runIndex).toBe(a.runIndex);
    expect(b.reducedList).toEqual(a.reducedList);
    expect(b.fingerprint).toBe(a.fingerprint);
  });
});

describe("A2", () => {
  it(
    "The garage buggy .hex with the garage pin map, rule, gremlins (bouncer, masher), 40 tries, 0.6 s, seed 20261102 through the upload model gives fingerprint 616062947f71a1ae.",
    { timeout: T },
    () => {
      const hex = read("examples/garage/buggy/buggy.hex");
      const pins = read("examples/garage/fixture.json");
      let s = chooseHex(initialUpload(), "buggy.hex", bytes(hex), hex);
      s = importPins(s, pins, bytes(pins));
      s = setRuleText(s, read("examples/garage/rules.txt"));
      s = toggleGremlin(s, "bouncer");
      if (!s.selected.includes("masher")) s = toggleGremlin(s, "masher");
      expect([...s.selected].sort(), "gremlins").toEqual(["bouncer", "masher"]);
      s = setField(s, "runs", "40");
      s = setField(s, "runLengthMs", "625");
      s = setField(s, "seed", "20261102");
      expect(uploadReady(s, false), "ready before the campaign").toBe(true);
      const p = pipeline(s);
      expect(p.req.runCycles, "runCycles for 625 ms").toBe(10_000_000);
      expect(p.verdict.verdict, "verdict").toBe("BROKE");
      expect(p.fingerprint, "reduced replay fingerprint").toBe("616062947f71a1ae");
    },
  );
});

describe("A3", () => {
  it(
    "fixtures/serial_hello/build/serial_hello.ino.hex with a minimal pin map gives COULDN'T TELL naming the serial port.",
    { timeout: T },
    () => {
      const hex = read("fixtures/serial_hello/build/serial_hello.ino.hex");
      const pins = JSON.stringify({
        pins: [
          { signal: "LED", port: "B", bit: 5, direction: "output" },
          { signal: "BUTTON", port: "D", bit: 2, direction: "input", activeLevel: "low" },
        ],
      });
      let s = chooseHex(initialUpload(), "serial_hello.ino.hex", bytes(hex), hex);
      s = importPins(s, pins, bytes(pins));
      s = setRuleText(s, "LED is 1 must never last 500 ms or longer.");
      expect(s.selected, "Masher preselected").toEqual(["masher"]);
      expect(uploadReady(s, false), "ready").toBe(true);
      const req = buildCampaignRequest(s);
      if (req === null) throw new Error("no request");
      const v = runCampaign(req).result.verdict;
      expect(v.verdict, "verdict").toBe("COULDN'T TELL");
      const serial = UNMODELLED_PERIPHERALS.find((r) => r.id === "USART0");
      if (serial === undefined) throw new Error("no USART0 row");
      if (v.verdict === "COULDN'T TELL") expect(v.reason).toContain(serial.plainName);
    },
  );
});

/** The Sample HEX with its first data record's type set to 0x05 and the checksum recomputed. */
function badRecordType(hex: string): string {
  const lines = hex.split("\n");
  const i = lines.findIndex((l) => l.startsWith(":") && l.slice(7, 9) === "00");
  const line = (lines[i] as string).replace(/\r$/, "");
  const body = line.slice(1, -2);
  const changed = `${body.slice(0, 6)}05${body.slice(8)}`;
  let sum = 0;
  for (let k = 0; k < changed.length; k += 2) sum += parseInt(changed.slice(k, k + 2), 16);
  const cc = ((256 - (sum & 0xff)) & 0xff).toString(16).toUpperCase().padStart(2, "0");
  lines[i] = `:${changed}${cc}`;
  return lines.join("\n");
}

/** The Sample HEX with its first data record's checksum byte changed. Returns the text and its 1-based line. */
function badChecksum(hex: string): { text: string; line: number } {
  const lines = hex.split("\n");
  const i = lines.findIndex((l) => l.startsWith(":") && l.slice(7, 9) === "00");
  const line = (lines[i] as string).replace(/\r$/, "");
  const cc = parseInt(line.slice(-2), 16);
  lines[i] = `${line.slice(0, -2)}${((cc + 1) & 0xff).toString(16).toUpperCase().padStart(2, "0")}`;
  return { text: lines.join("\n"), line: i + 1 };
}

describe("A4", () => {
  it(
    "Bad hex cases (bad checksum, bad record type, data beyond 32 KB, file over 256 KB, empty file) each give a plain error and leave Unleash disabled.",
    () => {
      const start = sampleState();
      expect(uploadReady(start, false), "the Sample state is ready").toBe(true);
      const sample = start.program?.text ?? "";
      const cs = badChecksum(sample);
      const cases: { name: string; file: string; size: number; text: string; want: string }[] = [
        {
          name: "bad checksum",
          file: "a.hex",
          size: bytes(cs.text),
          text: cs.text,
          want: `Line ${String(cs.line)} has a wrong checksum. The file may be damaged or cut short. Export the .hex again.`,
        },
        {
          name: "bad record type",
          file: "b.hex",
          size: 0,
          text: badRecordType(sample),
          want: "This doesn't read as a .hex file. Choose the compiled .hex for your program.",
        },
        {
          name: "data beyond 32 KB",
          file: "c.hex",
          size: 0,
          text: ":01800000007F\n:00000001FF\n",
          want: "This program won't fit: it's bigger than the chip's 32 KB of program memory. Choose a build that fits.",
        },
        {
          name: "file over 256 KB",
          file: "big.hex",
          size: 262_145,
          text: sample,
          want: "This file is over 256 KB, too big to haunt this chip. Choose the compiled .hex for your program.",
        },
        { name: "empty file", file: "empty.hex", size: 0, text: "", want: "Not even a ghost in here: this file is empty. Choose the compiled .hex for your program." },
      ];
      for (const c of cases) {
        const size = c.size === 0 && c.text !== "" ? bytes(c.text) : c.size;
        const s = chooseHex(start, c.file, size, c.text);
        expect(s.hexError?.text, `${c.name}: Hex_Error`).toBe(c.want);
        expect(s.program, `${c.name}: program discarded`).toBeNull();
        expect(uploadReady(s, false), `${c.name}: Unleash disabled`).toBe(false);
      }
    },
  );
});

const crosswalkPins = (): { pins: Record<string, unknown>[] } => JSON.parse(read("examples/crosswalk/fixture.json"));
const asText = (o: unknown): string => JSON.stringify(o);

describe("A5", () => {
  it(
    "Pin table cases (port E, bit 9, duplicate signal, duplicate port/bit, analog conflict, no output) each give a row error and leave Unleash disabled.",
    () => {
      const start = sampleState();
      expect(uploadReady(start, false), "the Sample state is ready").toBe(true);
      const rowErrors = (s: UploadState, signal: string): string[] => {
        const d = deriveUpload(s);
        const i = s.rows.findIndex((r) => r.signal === signal);
        return d.table.rowErrors[i] ?? [];
      };
      const imp = (o: unknown): UploadState => importPins(start, asText(o), bytes(asText(o)));
      const idOf = (signal: string): number => start.rows.find((r) => r.signal === signal)?.id ?? -1;

      // (a) port E
      const a = crosswalkPins();
      (a.pins[0] as Record<string, unknown>).port = "E";
      const sa = imp(a);
      expect(rowErrors(sa, "REQUEST"), "(a) port E").toContain("Port E isn't on this chip. Use port B, C or D.");
      expect(uploadReady(sa, false), "(a) Unleash disabled").toBe(false);

      // (b) bit 9
      const b = crosswalkPins();
      (b.pins[0] as Record<string, unknown>).bit = 9;
      const sb = imp(b);
      expect(rowErrors(sb, "REQUEST"), "(b) bit 9").toContain("Bit 9 is out of range. Use a bit from 0 to 7.");
      expect(uploadReady(sb, false), "(b) Unleash disabled").toBe(false);

      // (c) duplicate signal
      const sc = editRow(start, idOf("CAR_YELLOW"), { signal: "CAR_GREEN" });
      const dc = deriveUpload(sc);
      const dupText = "Two pins can't share the name CAR_GREEN. Give each pin its own signal name.";
      expect(dc.table.rowErrors[1], "(c) CAR_GREEN row").toContain(dupText);
      expect(dc.table.rowErrors[2], "(c) renamed row").toContain(dupText);
      expect(uploadReady(sc, false), "(c) Unleash disabled").toBe(false);

      // (d) duplicate port/bit
      const sd = editRow(start, idOf("CAR_YELLOW"), { port: "B", bit: 0 });
      const pbText = "Port B, bit 0 (PB0) is already taken. Pick another port or bit.";
      expect(rowErrors(sd, "CAR_GREEN"), "(d) CAR_GREEN row").toContain(pbText);
      expect(rowErrors(sd, "CAR_YELLOW"), "(d) CAR_YELLOW row").toContain(pbText);
      expect(uploadReady(sd, false), "(d) Unleash disabled").toBe(false);

      // (e) analog pin in an imported map: an import error, nothing else changes
      const e = crosswalkPins();
      e.pins.push({ signal: "KNOB", kind: "analog", channel: 0 });
      const se = imp(e);
      expect(se.importError, "(e) import error").toBe(
        "Entry 7 of the pins list is an analog pin. The pin table doesn't take analog pins, so remove it.",
      );
      expect(se.rows, "(e) rows unchanged").toEqual(start.rows);
      expect(se.program, "(e) program unchanged").toEqual(start.program);
      expect(se.ruleText, "(e) rule text unchanged").toBe(start.ruleText);
      expect(uploadReady(se, false), "(e) still ready").toBe(true);

      // (f) no output
      const sf = imp({ pins: [crosswalkPins().pins[0]] });
      expect(deriveUpload(sf).table.tableErrors, "(f) table error").toContain("No output to watch. Add at least one output pin.");
      expect(uploadReady(sf, false), "(f) Unleash disabled").toBe(false);
    },
  );
});

describe("Display replay determinism (Requirement 18.7)", () => {
  it("two display replays of the A1 Reduced_List on fresh bridges give the same Pin_Levels_View states", { timeout: T }, () => {
    const s = sampleState();
    const p = pipeline(s);
    if (p.verdict.verdict !== "BROKE" || p.reducedList === null) throw new Error("A1 did not break");
    const events = p.reducedList as DisplayReplayRequest["events"];
    const rep = must(
      runReplayJob(viaCodec<ReplayRequest>({ kind: "replay", hex: p.req.hex, fixture: p.req.fixture, ruleSet: p.req.ruleSet, events, runCycles: p.req.runCycles }, 4)),
      "replay",
    );
    if (rep.violation === null) throw new Error("the reduced replay did not break");
    const v = rep.violation.cycle;
    const display = () => {
      const d = decodeDisplayRequest(
        encodeDisplayRequest({ kind: "display-replay", jobId: 5, hex: p.req.hex, fixture: p.req.fixture, ruleSet: p.req.ruleSet, events, violationCycle: v }),
      );
      if (!d.ok) throw new Error(`codec: ${d.error.path}: ${d.error.message}`);
      return must(runDisplayReplayJob(d.message), "display replay");
    };
    const a = display();
    const b = display();
    const rows = pinLevelRows(s.rows);
    const cycles = [0, v, ...events.map((e) => e.cycle), ...a.outputEdges.map((e) => e.cycle), ...b.outputEdges.map((e) => e.cycle)];
    for (const cyc of cycles) {
      const sa = pinLevelsAt(rows, { events, outputEdges: a.outputEdges, v, ringSignals: [] }, cyc);
      const sb = pinLevelsAt(rows, { events, outputEdges: b.outputEdges, v, ringSignals: [] }, cyc);
      expect(sb, `Pin_Levels_View state at cycle ${String(cyc)}`).toEqual(sa);
    }
  });
});