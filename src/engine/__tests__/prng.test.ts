// Feature: gremlin-engine, task 4.3. Requirements 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 11.11.
// The reference vectors below are acceptance values copied literally from the
// design ("Reference vectors"). They must never be edited to make a test pass.
import { describe, expect, it } from "vitest";
import { boundedDraw, createPrng, isPrngError, type Prng } from "../prng";

function make(seed: number): Prng {
  const p = createPrng(seed);
  if (isPrngError(p)) throw new Error(`createPrng failed: ${p.message}`);
  return p;
}

const hex = (n: number): string => "0x" + n.toString(16).padStart(8, "0");

const ROUND1_RAW = "0xa15c02b7 0x7b47f409 0xba1d3330 0x83d2f293 0xbfa4784b 0xcbed606e";
const ROUND1_COINS = "HHTTTHTHHHTHTTTHHHHHTTTHHHTHTHTHTTHTTTHHHHHHTTTTHHTTTTTHTTTTTTTHT";
const ROUND1_ROLLS =
  "3 4 1 1 2 2 3 2 4 3 2 4 3 3 5 2 3 1 3 1 5 1 4 1 5 6 4 6 6 2 6 3 3";
const ROUND2_RAW = "0x74ab93ad 0x1c1da000 0x494ff896 0x34462f2f 0xd308a3e5 0x0fa83bab";
const ROUND3_RAW = "0x39af5f9f 0x04196b18 0xc3c3eb28 0xc076c60c 0xc693e135 0xf8f63932";

function draw(p: Prng, min: number, max: number): number {
  const v = p.nextInt(min, max);
  if (typeof v !== "number") throw new Error(v.message);
  return v;
}

function raw6(p: Prng): string {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) out.push(hex(p.nextU32()));
  return out.join(" ");
}

/** Replays the 52-card shuffle: boundedrand(i) for i from 52 down to 2. */
function shuffle52(p: Prng): void {
  for (let i = 52; i >= 2; i--) draw(p, 0, i - 1);
}

describe("PCG32 reference vectors, seed 42 stream 54", () => {
  it("matches round 1 raw outputs, coins and rolls, then rounds 2 and 3 raw outputs", () => {
    const p = make(42);

    expect(raw6(p)).toBe(ROUND1_RAW);

    let coins = "";
    for (let i = 0; i < 65; i++) coins += draw(p, 0, 1) !== 0 ? "H" : "T";
    expect(coins).toBe(ROUND1_COINS);

    const rolls: number[] = [];
    for (let i = 0; i < 33; i++) rolls.push(draw(p, 1, 6));
    expect(rolls.join(" ")).toBe(ROUND1_ROLLS);

    shuffle52(p);
    expect(raw6(p)).toBe(ROUND2_RAW);

    for (let i = 0; i < 65; i++) draw(p, 0, 1);
    for (let i = 0; i < 33; i++) draw(p, 1, 6);
    shuffle52(p);
    expect(raw6(p)).toBe(ROUND3_RAW);
  });
});

describe("distribution", () => {
  it("width 6 over 60,000 draws gives chi-square below 20.515 (0.001, 5 dof)", () => {
    const p = make(20260101);
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 60000;
    for (let i = 0; i < n; i++) counts[draw(p, 1, 6) - 1]++;
    const expected = n / 6;
    const chi = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(20.515);
  });
});

describe("scripted-source rejection", () => {
  it("bound 6 has threshold 4: outputs 0 and 3 are rejected and 4 returns 4", () => {
    const script = [0, 3, 4, 9];
    let pulled = 0;
    const src = (): number => script[pulled++]!;
    expect((2 ** 32 - 6) % 6).toBe(4);
    expect(boundedDraw(src, 0, 5)).toBe(4);
    expect(pulled).toBe(3);
  });
});

describe("examples", () => {
  it("rejects invalid ranges with invalid-range", () => {
    const p = make(1);
    const cases: Array<[number, number]> = [
      [5, 4],
      [0.5, 3],
      [0, 2.5],
      [Number.NaN, 3],
      [0, Number.POSITIVE_INFINITY],
      [0, 4294967296], // width 2^32 + 1
      [-(2 ** 53), 0],
      [0, 2 ** 53],
    ];
    for (const [min, max] of cases) {
      const r = p.nextInt(min, max);
      expect(isPrngError(r) && r.kind === "invalid-range").toBe(true);
    }
  });

  it("rejects invalid seeds with invalid-seed", () => {
    for (const s of [-1, 1.5, 4294967296, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = createPrng(s);
      expect(isPrngError(r) && r.kind === "invalid-seed").toBe(true);
    }
    expect(isPrngError(createPrng(0))).toBe(false);
    expect(isPrngError(createPrng(4294967295))).toBe(false);
  });

  it("leaves state and drawCount unchanged after invalid-range", () => {
    const a = make(7);
    const b = make(7);
    a.nextU32();
    b.nextU32();
    const before = a.drawCount;
    expect(isPrngError(a.nextInt(9, 3))).toBe(true);
    expect(isPrngError(a.nextInt(0, 4294967296))).toBe(true);
    expect(a.drawCount).toBe(before);
    for (let i = 0; i < 10; i++) expect(a.nextU32()).toBe(b.nextU32());
    expect(a.drawCount).toBe(b.drawCount);
  });

  it("a width-1 draw consumes one output", () => {
    const a = make(11);
    const b = make(11);
    expect(a.nextInt(7, 7)).toBe(7);
    expect(a.drawCount).toBe(1);
    b.nextU32();
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it("[0, 4294967295] takes the raw path: one output, returned unchanged", () => {
    const a = make(13);
    const b = make(13);
    expect(a.nextInt(0, 4294967295)).toBe(b.nextU32());
    expect(a.drawCount).toBe(1);
    // Scripted source: the raw value passes through with no rejection.
    let pulled = 0;
    expect(boundedDraw(() => (pulled++, 3), 0, 4294967295)).toBe(3);
    expect(pulled).toBe(1);
  });
});
