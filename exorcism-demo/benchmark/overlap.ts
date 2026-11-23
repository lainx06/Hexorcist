// Measures how long WALK and DONT_WALK are both on after one REQUEST press, for one crossing HEX.
//   npx tsx exorcism-demo/benchmark/overlap.ts <file.hex>
// Replays the single press the reducer found (REQUEST pressed at 770.5 ms, 1000 ms run) through the same
// engine replay the page uses and prints each both-on interval in CPU cycles and microseconds (16 MHz).
import { loadInput } from "../../cli/input-loader";
import { nodeReader, REPO_ROOT } from "../../cli/node-io";
import { runReplayJob } from "../../src/ui/app/worker/host";

const hex = process.argv[2];
if (hex === undefined) {
  console.log("usage: npx tsx exorcism-demo/benchmark/overlap.ts <file.hex>");
  process.exit(3);
}
const l = loadInput(
  { hex, pins: "examples/crosswalk/fixture.json", rules: "exorcism-demo/crosswalk-full-rules.txt", gremlins: "masher" },
  nodeReader(REPO_ROOT),
);
if (!l.ok) {
  console.log(l.reason);
  process.exit(3);
}
const press = { signal: "REQUEST", value: 0, cycle: 770.5 * 16000, gremlinId: "masher" };
const r = runReplayJob({ hex: l.input.hex, fixture: l.input.fixture, ruleSet: l.input.ruleSet, events: [press as never], runCycles: 16_000_000 });
if (!r.ok) {
  console.log(`replay failed: ${r.error.message}`);
  process.exit(3);
}
const level: Record<string, number> = { WALK: 0, DONT_WALK: 0 };
let start: number | null = null;
const both: { from: number; to: number }[] = [];
for (const e of r.outputEdges) {
  if (e.signal !== "WALK" && e.signal !== "DONT_WALK") continue;
  level[e.signal] = e.value === 1 ? 1 : 0;
  const on = level.WALK === 1 && level.DONT_WALK === 1;
  if (on && start === null) start = e.cycle;
  if (!on && start !== null) {
    both.push({ from: start, to: e.cycle });
    start = null;
  }
}
if (start !== null) both.push({ from: start, to: 16_000_000 });
if (both.length === 0) console.log("WALK and DONT_WALK were never both on in this replay.");
for (const b of both) {
  const cycles = b.to - b.from;
  console.log(`both on from ${(b.from / 16000).toFixed(3)} ms for ${cycles} cycles (${(cycles / 16).toFixed(2)} microseconds)`);
}
