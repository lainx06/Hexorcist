// UploadState: the Upload_Device's setup, its actions, readiness and the Campaign request. Pure.
import { GREMLIN_CATALOGUE, findGremlin } from "../../../engine/gremlins/catalogue";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import type { RuleForm } from "../../../engine/rules/ir";
import type { Fixture } from "../../../engine/types";
import { SAMPLE_FIELDS, sampleProgram, sampleRows, sampleRuleText } from "../data/upload-sample";
import type { CampaignRequest } from "../worker/messages";
import { checkRuns, checkSeed } from "./fields";
import type { FieldCheck } from "./fields";
import { PICKER_TEXT, isCompatible } from "./gremlin-picker";
import { importPinMap } from "./pin-map-file";
import { MAX_PINS, checkPinTable, newDigitalRow, previewFixture, setDirection } from "./pin-table";
import type { PinRow, PinTableCheck, RowPatch } from "./pin-table";
import type { SignalLabels } from "./signal-labels";
import { triesLine } from "./stage-copy";
import { UPLOAD_COPY, HEX_ERROR_TEXT, fill } from "./upload-copy";
import { UPLOAD_DEFAULTS, checkRunLength, msToCycles } from "./upload-fields";
import type { HexCheckResult, HexError, LoadedProgram } from "./upload-hex";
import { checkUploadRule, uploadPatterns } from "./upload-rule";
import type { UploadRuleCheck } from "./upload-rule";

export interface UploadState {
  program: LoadedProgram | null;
  hexError: HexError | null;
  /** Token of the file read in flight, or null. */
  reading: number | null;
  nextToken: number;
  rows: PinRow[];
  nextRowId: number;
  importError: string | null;
  ruleText: string;
  /** Selected gremlin ids, any order; the request uses orderGremlins. */
  selected: string[];
  /** Masher is still selected automatically when it becomes Compatible (Q9, D3). */
  autoMasher: boolean;
  fields: { runs: string; seed: string; runLengthMs: string };
  /** For the tries line while a field is invalid. */
  lastValid: { runs: number; runCycles: number };
}

export function initialUpload(): UploadState {
  return {
    program: null,
    hexError: null,
    reading: null,
    nextToken: 1,
    rows: [],
    nextRowId: 1,
    importError: null,
    ruleText: "",
    selected: [],
    autoMasher: true,
    fields: {
      runs: String(UPLOAD_DEFAULTS.runs),
      seed: String(UPLOAD_DEFAULTS.seed),
      runLengthMs: String(UPLOAD_DEFAULTS.runLengthMs),
    },
    lastValid: { runs: UPLOAD_DEFAULTS.runs, runCycles: msToCycles(UPLOAD_DEFAULTS.runLengthMs) },
  };
}

const compatibleWith = (id: string, fixture: Fixture): boolean => {
  const def = findGremlin(id);
  return def !== undefined && isCompatible(def, fixture);
};

/** Drop gremlins that no longer fit the table; keep the Masher preselection rules. */
function pruneGremlins(s: UploadState): UploadState {
  const fixture = previewFixture(s.rows);
  const selected = s.selected.filter((id) => compatibleWith(id, fixture));
  let autoMasher = s.autoMasher;
  if (s.selected.includes("masher") && !selected.includes("masher")) autoMasher = false;
  if (autoMasher && compatibleWith("masher", fixture)) return { ...s, selected: ["masher"], autoMasher };
  return { ...s, selected, autoMasher };
}

// File and sample

export function beginHexRead(s: UploadState): { state: UploadState; token: number } {
  const token = s.nextToken;
  return { state: { ...s, reading: token, nextToken: token + 1 }, token };
}

/** Applies only to the file chosen last; a stale token leaves the state as it is. */
export function hexChosen(s: UploadState, token: number, result: HexCheckResult): UploadState {
  if (token !== s.reading) return s;
  return result.ok
    ? { ...s, reading: null, program: result.program, hexError: null }
    : { ...s, reading: null, program: null, hexError: result.error };
}

export function hexReadFailed(s: UploadState, token: number): UploadState {
  return hexChosen(s, token, { ok: false, error: { text: HEX_ERROR_TEXT.unreadable, parser: null } });
}

export function loadSample(s: UploadState): UploadState {
  const rows = sampleRows(s.nextRowId);
  const next: UploadState = {
    ...s,
    program: sampleProgram(),
    hexError: null,
    reading: null,
    rows,
    nextRowId: s.nextRowId + rows.length,
    importError: null,
    ruleText: sampleRuleText(),
    selected: ["masher"],
    autoMasher: false,
    fields: { ...SAMPLE_FIELDS },
    lastValid: { runs: Number(SAMPLE_FIELDS.runs), runCycles: msToCycles(Number(SAMPLE_FIELDS.runLengthMs)) },
  };
  return pruneGremlins(next);
}

// Pin_Table

export function addRow(s: UploadState): UploadState {
  if (s.rows.length >= MAX_PINS) return s;
  return pruneGremlins({ ...s, rows: [...s.rows, newDigitalRow(s.nextRowId)], nextRowId: s.nextRowId + 1 });
}

export function removeRow(s: UploadState, id: number): UploadState {
  return pruneGremlins({ ...s, rows: s.rows.filter((r) => r.id !== id) });
}

export function editRow(s: UploadState, id: number, patch: RowPatch): UploadState {
  const rows = s.rows.map((r) => {
    if (r.id !== id) return r;
    const { direction, ...rest } = patch;
    const moved = direction === undefined ? r : setDirection(r, direction);
    return { ...moved, ...rest };
  });
  return pruneGremlins({ ...s, rows });
}

export function importPins(s: UploadState, text: string, bytes: number): UploadState {
  const r = importPinMap(text, bytes, s.nextRowId);
  if (!r.ok) return { ...s, importError: r.error };
  return pruneGremlins({ ...s, rows: r.rows, nextRowId: r.nextId, importError: null });
}

// Rule, gremlins, fields

export function setRuleText(s: UploadState, text: string): UploadState {
  return { ...s, ruleText: text };
}

/** Toggle a chip. A gremlin that does not fit the table is never added. Ends the Masher preselection. */
export function toggleGremlin(s: UploadState, id: string): UploadState {
  if (s.selected.includes(id)) return { ...s, selected: s.selected.filter((x) => x !== id), autoMasher: false };
  if (!compatibleWith(id, previewFixture(s.rows))) return { ...s, autoMasher: false };
  return { ...s, selected: [...s.selected, id], autoMasher: false };
}

export function setField(s: UploadState, key: "runs" | "seed" | "runLengthMs", text: string): UploadState {
  const fields = { ...s.fields, [key]: text };
  const lastValid = { ...s.lastValid };
  if (key === "runs") {
    const c = checkRuns(text);
    if (c.ok) lastValid.runs = c.value;
  } else if (key === "runLengthMs") {
    const c = checkRunLength(text);
    if (c.ok) lastValid.runCycles = msToCycles(c.value);
  }
  return { ...s, fields, lastValid };
}

// Derived

export interface UploadDerived {
  table: PinTableCheck;
  rule: UploadRuleCheck;
  patterns: { form: RuleForm; sentence: string }[];
  previewFixture: Fixture;
  uploadFixture: Fixture | null;
  runs: FieldCheck;
  seed: FieldCheck;
  runLength: FieldCheck;
  triesLine: string;
}

export function deriveUpload(s: UploadState): UploadDerived {
  const table = checkPinTable(s.rows);
  const preview = previewFixture(s.rows);
  const runs = checkRuns(s.fields.runs);
  const seed = checkSeed(s.fields.seed);
  const runLength = checkRunLength(s.fields.runLengthMs);
  return {
    table,
    rule: checkUploadRule(s.ruleText, s.rows, table),
    patterns: uploadPatterns(s.rows),
    previewFixture: preview,
    uploadFixture: table.ok ? preview : null,
    runs,
    seed,
    runLength,
    triesLine: triesLine(
      runs.ok ? runs.value : s.lastValid.runs,
      runLength.ok ? msToCycles(runLength.value) : s.lastValid.runCycles,
    ),
  };
}

/** Upload_Ready: a program, no read in flight, a valid table and rule, gremlins, valid fields, no job. */
export function uploadReady(s: UploadState, busy: boolean): boolean {
  if (busy || s.program === null || s.reading !== null || s.selected.length === 0) return false;
  const d = deriveUpload(s);
  return d.table.ok && d.rule.ok && d.runs.ok && d.seed.ok && d.runLength.ok;
}

/** The selected gremlins in GREMLIN_CATALOGUE order, whatever order they were toggled in (Q11). */
export function orderGremlins(ids: readonly string[]): GremlinSpec[] {
  return GREMLIN_CATALOGUE.filter((g) => ids.includes(g.id)).map((g) => ({ id: g.id }));
}

/** "Gremlin order: Masher, Bouncer", in the order of the request's gremlinSet; null when none are selected. */
export function gremlinOrderLine(ids: readonly string[]): string | null {
  const names = orderGremlins(ids).map((g) => PICKER_TEXT[g.id]?.name ?? g.id);
  return names.length === 0 ? null : fill(UPLOAD_COPY.gremlinOrder, { names: names.join(", ") });
}

/** The campaign request, or null unless Upload_Ready holds. Never holds a Plain_Name. */
export function buildCampaignRequest(s: UploadState): Omit<CampaignRequest, "jobId"> | null {
  if (!uploadReady(s, false) || s.program === null) return null;
  const d = deriveUpload(s);
  if (!d.rule.ok || !d.runs.ok || !d.seed.ok || !d.runLength.ok || d.uploadFixture === null) return null;
  return {
    kind: "campaign",
    hex: s.program.text,
    fixture: d.uploadFixture,
    ruleSet: d.rule.ruleSet,
    gremlinSet: orderGremlins(s.selected),
    campaignSeed: d.seed.value,
    runs: d.runs.value,
    runCycles: msToCycles(d.runLength.value),
    measure: false,
  };
}

/** Signal_Name to Plain_Name, for the story, lanes and logs of one Campaign. */
export function uploadLabels(rows: readonly PinRow[]): SignalLabels {
  const names: Record<string, string> = {};
  for (const r of rows) names[r.signal] = r.plainName;
  return { kind: "upload", names };
}