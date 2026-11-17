// Message_Codec: encode and decode Worker_Messages field by field. Pure. Decoding never throws.
import type { DisplayReplayRequest, WorkerMessage, WorkerReply, WorkerRequest } from "./messages";
import { DISPLAY_REPLAY_KIND, REPLY_KINDS, REQUEST_KINDS } from "./messages";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export interface CodecError {
  path: string;
  message: string;
}

export type Decoded<T> = { ok: true; message: T } | { ok: false; error: CodecError };

class Fault {
  constructor(
    readonly path: string,
    readonly message: string,
  ) {}
}

type Schema = (v: unknown, path: string) => JsonValue;

function join(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function where(path: string): string {
  return path === "" ? "Message" : `Field ${path}`;
}

const nat: Schema = (v, path) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
    throw new Fault(path, `${where(path)}: must be a non-negative integer.`);
  }
  return v === 0 ? 0 : v;
};

const str: Schema = (v, path) => {
  if (typeof v !== "string") throw new Fault(path, `${where(path)}: must be a string.`);
  return v;
};

const bool: Schema = (v, path) => {
  if (typeof v !== "boolean") throw new Fault(path, `${where(path)}: must be a boolean.`);
  return v;
};

const seconds: Schema = (v, path) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Fault(path, `${where(path)}: must be a finite number of at least 0.`);
  }
  return v === 0 ? 0 : v;
};

function literal(...values: readonly (string | number | boolean)[]): Schema {
  return (v, path) => {
    if (!values.some((x) => x === v)) {
      throw new Fault(path, `${where(path)}: must be one of ${values.map((x) => JSON.stringify(x)).join(", ")}.`);
    }
    return v as JsonValue;
  };
}

function nullable(s: Schema): Schema {
  return (v, path) => (v === null ? null : s(v, path));
}

function arr(s: Schema): Schema {
  return (v, path) => {
    if (!Array.isArray(v)) throw new Fault(path, `${where(path)}: must be an array.`);
    const out: JsonValue[] = [];
    for (let i = 0; i < v.length; i++) out.push(s(v[i], `${path}[${String(i)}]`));
    return out;
  };
}

function obj(fields: Readonly<Record<string, Schema>>): Schema {
  return (v, path) => {
    if (!isPlainObject(v)) throw new Fault(path, `${where(path)}: must be a plain object.`);
    const out: { [k: string]: JsonValue } = {};
    for (const key of Object.keys(fields)) {
      const p = join(path, key);
      if (!Object.prototype.hasOwnProperty.call(v, key)) throw new Fault(p, `${where(p)}: is missing.`);
      out[key] = (fields[key] as Schema)(v[key], p);
    }
    return out;
  };
}

/** Any JSON data (plain objects, arrays, strings, booleans, null, finite numbers), copied. */
const json: Schema = (v, path) => {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Fault(path, `${where(path)}: must be a finite number.`);
    return v === 0 ? 0 : v;
  }
  if (Array.isArray(v)) return v.map((x, i) => json(x, `${path}[${String(i)}]`));
  if (isPlainObject(v)) {
    const out: { [k: string]: JsonValue } = {};
    for (const key of Object.keys(v)) out[key] = json(v[key], join(path, key));
    return out;
  }
  throw new Fault(path, `${where(path)}: must be JSON data.`);
};

const fixture: Schema = (v, path) => {
  if (!isPlainObject(v)) throw new Fault(path, `${where(path)}: must be a plain object.`);
  const pinsPath = join(path, "pins");
  if (!Array.isArray(v.pins)) throw new Fault(pinsPath, `${where(pinsPath)}: must be an array.`);
  v.pins.forEach((p, i) => {
    const pp = `${pinsPath}[${String(i)}]`;
    if (!isPlainObject(p)) throw new Fault(pp, `${where(pp)}: must be a plain object.`);
    str(p.signal, join(pp, "signal"));
  });
  return json(v, path);
};

const ruleSet: Schema = (v, path) => {
  if (!Array.isArray(v)) throw new Fault(path, `${where(path)}: must be an array.`);
  v.forEach((r, i) => {
    const rp = `${path}[${String(i)}]`;
    if (!isPlainObject(r)) throw new Fault(rp, `${where(rp)}: must be a plain object.`);
  });
  return json(v, path);
};

const gremlinSet: Schema = (v, path) => {
  if (!Array.isArray(v)) throw new Fault(path, `${where(path)}: must be an array.`);
  v.forEach((g, i) => {
    const gp = `${path}[${String(i)}]`;
    if (!isPlainObject(g)) throw new Fault(gp, `${where(gp)}: must be a plain object.`);
    str(g.id, join(gp, "id"));
    if ("params" in g && g.params !== undefined && !isPlainObject(g.params)) {
      const pp = join(gp, "params");
      throw new Fault(pp, `${where(pp)}: must be a plain object.`);
    }
  });
  return json(v, path);
};

const analog: Schema = (v, path) => {
  const n = nat(v, path);
  if ((n as number) > 1023) throw new Fault(path, `${where(path)}: must be an integer from 0 to 1023.`);
  return n;
};

/** An input event: cycle, signal, gremlinId and exactly one of value or analog. */
const inputEvent: Schema = (v, path) => {
  if (!isPlainObject(v)) throw new Fault(path, `${where(path)}: must be a plain object.`);
  const hasValue = Object.prototype.hasOwnProperty.call(v, "value");
  const hasAnalog = Object.prototype.hasOwnProperty.call(v, "analog");
  if (hasValue === hasAnalog) {
    const p = join(path, hasValue ? "analog" : "value");
    throw new Fault(p, `${where(path)}: must hold exactly one of value and analog.`);
  }
  for (const key of Object.keys(v)) {
    if (!["cycle", "signal", "gremlinId", "value", "analog"].includes(key)) {
      const p = join(path, key);
      throw new Fault(p, `${where(p)}: is not allowed in an event.`);
    }
  }
  const out: { [k: string]: JsonValue } = {
    cycle: nat(v.cycle, join(path, "cycle")),
    signal: str(v.signal, join(path, "signal")),
    gremlinId: str(v.gremlinId, join(path, "gremlinId")),
  };
  if (hasValue) out.value = literal(0, 1, "release")(v.value, join(path, "value"));
  else out.analog = analog(v.analog, join(path, "analog"));
  return out;
};

const outputEdge: Schema = obj({ signal: str, value: literal(0, 1, "input"), cycle: nat });
const violation: Schema = obj({ rule: str, cycle: nat });
const jobError: Schema = obj({ kind: str, message: str });
const measure: Schema = nullable(obj({ totalCycles: nat, seconds }));

const verdict: Schema = (v, path) => {
  if (!isPlainObject(v)) throw new Fault(path, `${where(path)}: must be a plain object.`);
  const kp = join(path, "verdict");
  switch (v.verdict) {
    case "BROKE":
      return obj({
        verdict: literal("BROKE"),
        trace: obj({
          runIndex: nat,
          runSeed: nat,
          eventList: arr(inputEvent),
          outputEvents: arr(outputEdge),
          violation,
        }),
        unchecked: arr(obj({ rule: str, reason: str })),
      })(v, path);
    case "HELD":
      return obj({ verdict: literal("HELD"), text: str, runs: nat })(v, path);
    case "COULDN'T TELL":
      return obj({ verdict: literal("COULDN'T TELL"), reason: str })(v, path);
    default:
      throw new Fault(kp, `${where(kp)}: must be "BROKE", "HELD" or "COULDN'T TELL".`);
  }
};

const coverage: Schema = obj({ triggerCounts: arr(nullable(nat)), gremlinEvents: nat });

const peripheralUse: Schema = obj({
  peripheral: str,
  register: str,
  cycle: nat,
  access: literal("read", "write"),
});

const compactBase: Schema = obj({
  runsCompleted: nat,
  requestedRuns: nat,
  violatingRunIndex: nullable(nat),
  verdict,
  coverage,
  totalCycles: nat,
});

const peripheralUsesField: Schema = obj({ runIndex: nat, uses: arr(peripheralUse) });

/** The compact result, with the optional peripheralUses object checked when present. */
const compactResult: Schema = (v, path) => {
  const base = compactBase(v, path) as { [k: string]: JsonValue };
  const raw = v as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, "peripheralUses") && raw.peripheralUses !== undefined) {
    base.peripheralUses = peripheralUsesField(raw.peripheralUses, join(path, "peripheralUses"));
  }
  return base;
};

const reducerResult: Schema = obj({
  originalEventCount: nat,
  reducedEventCount: nat,
  candidatesTried: nat,
  stoppedAtBudget: bool,
  reducedList: arr(inputEvent),
  violation,
});

const SCHEMAS: Readonly<Record<string, Readonly<Record<string, Schema>>>> = {
  campaign: {
    jobId: nat,
    hex: str,
    fixture,
    ruleSet,
    gremlinSet,
    campaignSeed: nat,
    runs: nat,
    runCycles: nat,
    measure: bool,
  },
  reduce: {
    jobId: nat,
    hex: str,
    fixture,
    ruleSet,
    originalList: arr(inputEvent),
    violation,
    runCycles: nat,
    measure: bool,
  },
  replay: { jobId: nat, hex: str, fixture, ruleSet, events: arr(inputEvent), runCycles: nat },
  [DISPLAY_REPLAY_KIND]: {
    jobId: nat,
    hex: str,
    fixture,
    ruleSet,
    events: arr(inputEvent),
    violationCycle: nat,
  },
  "campaign-progress": { jobId: nat, runsCompleted: nat, total: nat, finished: literal(false) },
  "campaign-done": {
    jobId: nat,
    runsCompleted: nat,
    total: nat,
    finished: literal(true),
    result: compactResult,
    measure,
  },
  "reduce-progress": { jobId: nat, candidatesTried: nat, bestGremlinCount: nat, bestList: arr(inputEvent) },
  "reduce-done": { jobId: nat, result: reducerResult, measure },
  "replay-done": {
    jobId: nat,
    violation: nullable(violation),
    outputEdges: arr(outputEdge),
    reachedEnd: nat,
    fingerprint: str,
  },
  "job-error": { jobId: nat, job: literal("campaign", "reduce", "replay", "message"), error: jobError },
};

function convert(v: unknown, kinds: readonly string[]): JsonValue {
  if (!isPlainObject(v)) throw new Fault("$", "Message: must be a plain object.");
  const kind = v.kind;
  if (typeof kind !== "string" || !kinds.includes(kind)) {
    throw new Fault("kind", "Field kind: is missing or names no message kind of this direction.");
  }
  const body = obj(SCHEMAS[kind] as Record<string, Schema>)(v, "");
  return { kind, ...(body as { [k: string]: JsonValue }) };
}

function decodeWith<T>(v: unknown, kinds: readonly string[]): Decoded<T> {
  try {
    return { ok: true, message: convert(v, kinds) as unknown as T };
  } catch (e) {
    if (e instanceof Fault) return { ok: false, error: { path: e.path, message: e.message } };
    return { ok: false, error: { path: "$", message: "Message: could not be read." } };
  }
}

const ALL_KINDS: readonly string[] = [...REQUEST_KINDS, ...REPLY_KINDS];

/** A fresh plain JSON value built field by field. Throws only for a message that is not valid. */
export function encodeMessage(m: WorkerMessage): JsonValue {
  const d = decodeWith<WorkerMessage>(m, ALL_KINDS);
  if (!d.ok) throw new Error(`The message could not be encoded: ${d.error.path}: ${d.error.message}`);
  return d.message as unknown as JsonValue;
}

export function decodeMessage(v: unknown): Decoded<WorkerMessage> {
  return decodeWith<WorkerMessage>(v, ALL_KINDS);
}

export function decodeRequest(v: unknown): Decoded<WorkerRequest> {
  return decodeWith<WorkerRequest>(v, REQUEST_KINDS);
}

export function decodeDisplayRequest(v: unknown): Decoded<DisplayReplayRequest> {
  return decodeWith<DisplayReplayRequest>(v, [DISPLAY_REPLAY_KIND]);
}

export function encodeDisplayRequest(m: DisplayReplayRequest): JsonValue {
  const d = decodeDisplayRequest(m);
  if (!d.ok) throw new Error(`The message could not be encoded: ${d.error.path}: ${d.error.message}`);
  return d.message as unknown as JsonValue;
}

export function decodeReply(v: unknown): Decoded<WorkerReply> {
  return decodeWith<WorkerReply>(v, REPLY_KINDS);
}