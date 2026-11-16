// Line diff with 3 context lines (unified-diff hunks). Pure.
// Splits only at "\n"; a "\r" stays in its line, so joining with "\n" gives the input back.

export type DiffLine = { type: "context" | "removed" | "added"; text: string };

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

type Op = { type: "keep" | "removed" | "added"; text: string; oldIdx: number; newIdx: number };

function editScript(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // lcs[i][j]: LCS length of a[i..] and b[j..].
  const lcs: Int32Array[] = [];
  for (let i = 0; i <= n; i++) lcs.push(new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i] as Int32Array;
    const below = lcs[i + 1] as Int32Array;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? (below[j + 1] as number) + 1 : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ type: "keep", text: a[i] as string, oldIdx: i, newIdx: j });
      i++;
      j++;
    } else if (i < n && (j >= m || ((lcs[i + 1] as Int32Array)[j] as number) >= ((lcs[i] as Int32Array)[j + 1] as number))) {
      ops.push({ type: "removed", text: a[i] as string, oldIdx: i, newIdx: j });
      i++;
    } else {
      ops.push({ type: "added", text: b[j] as string, oldIdx: i, newIdx: j });
      j++;
    }
  }
  return ops;
}

export function diffHunks(oldText: string, newText: string, context = 3): DiffHunk[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const ops = editScript(a, b);
  const changed: number[] = [];
  ops.forEach((op, k) => {
    if (op.type !== "keep") changed.push(k);
  });
  if (changed.length === 0) return [];
  // Group change positions: merge when 2 * context or fewer kept ops separate them.
  const groups: { lo: number; hi: number }[] = [];
  for (const k of changed) {
    const g = groups[groups.length - 1];
    if (g !== undefined && k - g.hi - 1 <= 2 * context) g.hi = k;
    else groups.push({ lo: k, hi: k });
  }
  const hunks: DiffHunk[] = [];
  for (const g of groups) {
    const lo = Math.max(0, g.lo - context);
    const hi = Math.min(ops.length - 1, g.hi + context);
    const slice = ops.slice(lo, hi + 1);
    const lines: DiffLine[] = slice.map((op) => ({
      type: op.type === "keep" ? "context" : op.type,
      text: op.text,
    }));
    const head = slice[0] as Op;
    const oldCount = slice.filter((op) => op.type !== "added").length;
    const newCount = slice.filter((op) => op.type !== "removed").length;
    hunks.push({
      oldStart: oldCount > 0 ? head.oldIdx + 1 : head.oldIdx,
      oldCount,
      newStart: newCount > 0 ? head.newIdx + 1 : head.newIdx,
      newCount,
      lines,
    });
  }
  return hunks;
}

/** Applies hunks made by diffHunks for this old text. */
export function applyHunks(oldText: string, hunks: readonly DiffHunk[]): string {
  const a = oldText.split("\n");
  const out: string[] = [];
  let pos = 0; // 0-based index into a
  for (const h of hunks) {
    const start = h.oldCount > 0 ? h.oldStart - 1 : h.oldStart;
    while (pos < start) out.push(a[pos++] as string);
    for (const l of h.lines) {
      if (l.type === "context") {
        out.push(l.text);
        pos++;
      } else if (l.type === "removed") {
        pos++;
      } else {
        out.push(l.text);
      }
    }
  }
  while (pos < a.length) out.push(a[pos++] as string);
  return out.join("\n");
}

/** Sketch name shown with no file extension. */
export function sketchName(file: "buggy" | "fixed"): string {
  return file;
}