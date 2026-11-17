// Pacing plan: maps UI time to a whole-cycle Cursor for the Broke scene.
// Pure and integer-only. Products of positions and cycle lengths use BigInt
// because they reach about 10^17. It reads no clock and draws no random numbers.

export const PRE_ROLL = 3_200_000;
export const CLUSTER_GAP = 800_000;
export const MIN_DWELL_MS = 400;
export const TARGET_MS = 8_000;
export const CYCLES_PER_MS = 16_000;
export const POS_PER_MS = 160_000;
export const SLIDER_MAX = 10;
export const FIX_TAIL = 8_000_000;
export const TAIL_CYCLES_PER_UI_MS = 4_000;
/** Requirement 5.5 applies only to Segments at most this long. */
export const BOUNDED_SEGMENT = 16_000_000;

export interface PacePiece {
  from: number;
  to: number;
  ms: number;
  held: boolean;
}

export interface PacingPlan {
  start: number;
  end: number;
  pieces: PacePiece[];
  totalMs: number;
}

export interface Ratio {
  num: number;
  den: number;
}

/** A run of two or more Gremlin_Event cycles, each within CLUSTER_GAP of the next. */
export interface Cluster {
  cycles: number[];
}

export function sortedCycles(events: readonly number[]): number[] {
  return [...events].sort((a, b) => a - b);
}

/** Segment length v - S in cycles. */
export function segmentLength(plan: Pick<PacingPlan, 'start' | 'end'>): number {
  return plan.end - plan.start;
}

export function findClusters(events: readonly number[]): Cluster[] {
  const g = sortedCycles(events);
  const out: Cluster[] = [];
  let run: number[] = [];
  for (const c of g) {
    if (run.length > 0 && c - run[run.length - 1]! < CLUSTER_GAP) {
      run.push(c);
    } else {
      if (run.length >= 2) out.push({ cycles: run });
      run = [c];
    }
  }
  if (run.length >= 2) out.push({ cycles: run });
  return out;
}

/** Build the plan for the reduced event cycles and the break cycle v. */
export function buildPlan(events: readonly number[], v: number): PacingPlan {
  const g = sortedCycles(events);
  const start = g.length > 0 ? Math.max(0, g[0]! - PRE_ROLL) : 0;
  const inCluster = new Set<number>();
  for (const cl of findClusters(g)) for (const c of cl.cycles) inCluster.add(c);

  const points = new Set<number>([start, v]);
  for (const c of g) if (c > start && c < v) points.add(c);
  const b = [...points].sort((x, y) => x - y);

  const pieces: PacePiece[] = [];
  for (let j = 0; j + 1 < b.length; j++) {
    const from = b[j]!;
    const to = b[j + 1]!;
    const held = inCluster.has(from);
    const ms = Math.max(held ? MIN_DWELL_MS : 0, Math.ceil((to - from) / CYCLES_PER_MS));
    pieces.push({ from, to, ms, held });
  }

  const n = pieces.length;
  if (n > 0) {
    const sum = pieces.reduce((a, p) => a + p.ms, 0);
    const free = TARGET_MS - sum;
    if (free > 0) {
      const share = Math.floor(free / n);
      const extra = free % n;
      pieces.forEach((p, j) => {
        p.ms += share + (j < extra ? 1 : 0);
      });
    }
  }
  const totalMs = pieces.reduce((a, p) => a + p.ms, 0);
  return { start, end: v, pieces, totalMs };
}

function clampStep(s: number): number {
  return Math.min(SLIDER_MAX, Math.max(0, Math.trunc(s)));
}

/** Position units a piece lasts at slider step s: D * 16,000 * (10 - s) + L * s. */
function pieceUnits(piece: PacePiece, s: number): bigint {
  const len = BigInt(piece.to - piece.from);
  return BigInt(piece.ms) * BigInt(CYCLES_PER_MS) * BigInt(SLIDER_MAX - s) + len * BigInt(s);
}

function prefix(plan: PacingPlan, s: number): bigint[] {
  const u: bigint[] = [0n];
  for (const piece of plan.pieces) u.push(u[u.length - 1]! + pieceUnits(piece, s));
  return u;
}

/** Index of the piece with U_j <= p < U_{j+1}; the last piece once p passes the end. */
function pieceAt(u: bigint[], p: bigint): number {
  const last = u.length - 2;
  for (let j = 0; j <= last; j++) if (p < u[j + 1]!) return j;
  return last;
}

/** Total plan length in position units at slider step s. */
export function totalUnits(plan: PacingPlan, s: number): number {
  const u = prefix(plan, clampStep(s));
  return Number(u[u.length - 1]!);
}

/** Cursor cycle at position p (1/160,000 UI ms) for slider step s. */
export function cursorAt(plan: PacingPlan, s: number, p: number): number {
  const n = plan.pieces.length;
  if (n === 0) return plan.end;
  const step = clampStep(s);
  const u = prefix(plan, step);
  const pos = BigInt(Math.max(0, Math.floor(p)));
  if (pos >= u[n]!) return plan.pieces[n - 1]!.to;
  const j = pieceAt(u, pos);
  const piece = plan.pieces[j]!;
  const len = BigInt(piece.to - piece.from);
  const off = ((pos - u[j]!) * len) / pieceUnits(piece, step);
  return piece.from + Number(off);
}

/** Slow_Factor N_j / (10 L_j) at position p, as an exact ratio. */
export function slowFactorAt(plan: PacingPlan, s: number, p: number): Ratio {
  const n = plan.pieces.length;
  if (n === 0) return { num: 1, den: 1 };
  const step = clampStep(s);
  const u = prefix(plan, step);
  const pos = BigInt(Math.max(0, Math.floor(p)));
  const j = pos >= u[n]! ? n - 1 : pieceAt(u, pos);
  const piece = plan.pieces[j]!;
  return {
    num: Number(pieceUnits(piece, step)),
    den: SLIDER_MAX * (piece.to - piece.from),
  };
}

/** Smallest position at which the Cursor reaches cycle c for slider step s. */
export function positionOf(plan: PacingPlan, s: number, c: number): number {
  const n = plan.pieces.length;
  if (n === 0) return 0;
  const step = clampStep(s);
  const u = prefix(plan, step);
  if (c <= plan.start) return 0;
  if (c >= plan.pieces[n - 1]!.to) return Number(u[n]!);
  let j = 0;
  while (j < n - 1 && c >= plan.pieces[j]!.to) j++;
  const piece = plan.pieces[j]!;
  const len = BigInt(piece.to - piece.from);
  const num = BigInt(c - piece.from) * pieceUnits(piece, step);
  const off = (num + len - 1n) / len;
  return Number(u[j]! + off);
}

/** Fix_View only: add the tail piece [v, E) shown at 4x. */
export function withTail(plan: PacingPlan, endCycle: number): PacingPlan {
  if (endCycle <= plan.end) return plan;
  const ms = Math.ceil((endCycle - plan.end) / TAIL_CYCLES_PER_UI_MS);
  const piece: PacePiece = { from: plan.end, to: endCycle, ms, held: false };
  return {
    start: plan.start,
    end: endCycle,
    pieces: [...plan.pieces, piece],
    totalMs: plan.totalMs + ms,
  };
}

/** End cycle E of the Fix_View tail: min(v + 8,000,000, reachedEnd of the right replay). */
export function tailEnd(v: number, reachedEnd: number): number {
  return Math.min(v + FIX_TAIL, reachedEnd);
}

/** Round a Slow_Factor num/den to a friendly whole number, never below 2. */
export function friendlyFactor(f: Ratio): number {
  const { num, den } = f;
  let r: number;
  if (num < 10 * den) {
    r = Math.floor((2 * num + den) / (2 * den));
  } else if (num < 100 * den) {
    r = 5 * Math.floor((2 * num + 5 * den) / (10 * den));
  } else {
    r = 10 * Math.floor((2 * num + 10 * den) / (20 * den));
  }
  return Math.max(2, r);
}

export function speedBadge(f: Ratio): string {
  if (f.num === f.den) return 'Real speed';
  return `Slowed ${friendlyFactor(f)}\u00d7 so you can see it`;
}
