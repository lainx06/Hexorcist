// Search parts of the Reducer_Core: ddmin and passes A, B and C, as generators.
// Each yield is one candidate; the driver sends back whether it was accepted and, when it was,
// has already made it the best list, so every part reads st.best after each yield.
// Pure: no wall clock, no random source.

import type { Fixture } from "../types";
import { copyEvent, findBursts, isRest, isSnapEligible, noChangeIndexes, snapValue } from "./events";
import type { CandidatePart, ReducerEvent } from "./types";

/** One event of a list, tagged with the index of its source event in the original list. */
export interface Entry {
  src: number;
  ev: ReducerEvent;
}

export interface SearchState {
  readonly fixture: Fixture;
  best: Entry[];
}

export interface Probe {
  part: CandidatePart;
  entries: Entry[];
}

export type Part = Generator<Probe, boolean, boolean>;

/** The best list minus the gremlin events whose src is in ids. Rest events always stay. */
export function removeIds(best: readonly Entry[], ids: ReadonlySet<number>): Entry[] {
  const out: Entry[] = [];
  for (const x of best) {
    if (ids.has(x.src) && !isRest(x.ev)) continue;
    out.push({ src: x.src, ev: copyEvent(x.ev) });
  }
  return out;
}

/** The best list with the snap-eligible events whose src is in ids set to their Snap_Value. */
export function snapIds(best: readonly Entry[], ids: ReadonlySet<number>): Entry[] {
  return best.map((x) => {
    const ev = copyEvent(x.ev);
    if (ids.has(x.src) && isSnapEligible(x.ev)) {
      (ev as { analog: number }).analog = snapValue((x.ev as { analog: number }).analog);
    }
    return { src: x.src, ev };
  });
}

function gremlinIds(best: readonly Entry[]): number[] {
  const out: number[] = [];
  for (const x of best) if (!isRest(x.ev)) out.push(x.src);
  return out;
}

/** n contiguous chunks; the larger chunks come first. */
function chunks(ids: readonly number[], n: number): number[][] {
  const out: number[][] = [];
  const base = Math.floor(ids.length / n);
  const extra = ids.length % n;
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(ids.slice(at, at + size));
    at += size;
  }
  return out;
}

/** ddmin over the gremlin events of the best list (Requirements 5.8, 5.12). */
export function* ddmin(st: SearchState): Part {
  let changed = false;
  let n = 2;
  for (;;) {
    const g = gremlinIds(st.best);
    const L = g.length;
    if (L === 0) return changed;
    if (n > L) n = L;
    if (n === 1) {
      const ok = yield { part: "ddmin", entries: removeIds(st.best, new Set(g)) };
      if (ok) {
        changed = true;
        continue;
      }
      return changed;
    }
    const parts = chunks(g, n);
    let accepted = false;
    for (let i = 0; i < n && !accepted; i++) {
      const keep = new Set(parts[i]);
      const drop = new Set(g.filter((id) => !keep.has(id)));
      if (yield { part: "ddmin", entries: removeIds(st.best, drop) }) {
        changed = true;
        accepted = true;
        n = 2;
      }
    }
    if (accepted) continue;
    if (n >= 3) {
      for (let i = 0; i < n && !accepted; i++) {
        if (yield { part: "ddmin", entries: removeIds(st.best, new Set(parts[i])) }) {
          changed = true;
          accepted = true;
          n = Math.max(n - 1, 2);
        }
      }
      if (accepted) continue;
    }
    if (n < L) {
      n = Math.min(2 * n, L);
      continue;
    }
    return changed;
  }
}

/** Pass A: remove every No_Change_Event, then each one alone (Requirements 6.2, 6.3, 6.5). */
export function* passA(st: SearchState): Part {
  const nce = noChangeIndexes(
    st.best.map((x) => x.ev),
    st.fixture,
  ).map((i) => st.best[i].src);
  if (nce.length === 0) return false;
  if (yield { part: "passA", entries: removeIds(st.best, new Set(nce)) }) return true;
  if (nce.length < 2) return false;
  let changed = false;
  for (const id of nce) {
    if (yield { part: "passA", entries: removeIds(st.best, new Set([id])) }) changed = true;
  }
  return changed;
}

/** Pass B: for each Burst keep its last 1, 2, 4, ... events until one is accepted (Requirements 7.2 to 7.4). */
export function* passB(st: SearchState): Part {
  const start = findBursts(st.best.map((x) => x.ev));
  if (start.length === 0) return false;
  const lastIds = start.map((b) => st.best[b[b.length - 1]].src);
  let changed = false;
  for (const lastId of lastIds) {
    let m = 1;
    for (;;) {
      const now = findBursts(st.best.map((x) => x.ev));
      const cur = now.find((bb) => st.best[bb[bb.length - 1]].src === lastId);
      if (cur === undefined || m >= cur.length) break;
      const drop = new Set(cur.slice(0, cur.length - m).map((i) => st.best[i].src));
      if (yield { part: "passB", entries: removeIds(st.best, drop) }) {
        changed = true;
        break;
      }
      m = 2 * m;
    }
  }
  return changed;
}

/** Pass C: snap every Snap_Eligible_Event, then each one alone (Requirements 8.1 to 8.6). */
export function* passC(st: SearchState): Part {
  const ids = st.best.filter((x) => isSnapEligible(x.ev)).map((x) => x.src);
  if (ids.length === 0) return false;
  if (yield { part: "passC", entries: snapIds(st.best, new Set(ids)) }) return true;
  if (ids.length < 2) return false;
  let changed = false;
  for (const id of ids) {
    if (yield { part: "passC", entries: snapIds(st.best, new Set([id])) }) changed = true;
  }
  return changed;
}

/** The whole search: the confirmation run, then Rounds until one has no accepted change. */
export function* search(st: SearchState): Generator<Probe, void, boolean> {
  yield { part: "confirm", entries: st.best.map((x) => ({ src: x.src, ev: copyEvent(x.ev) })) };
  for (;;) {
    let changed = false;
    if (yield* ddmin(st)) changed = true;
    if (yield* passA(st)) changed = true;
    if (yield* passB(st)) changed = true;
    if (yield* passC(st)) changed = true;
    if (!changed) return;
  }
}