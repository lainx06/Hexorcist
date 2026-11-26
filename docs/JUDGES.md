# A five-minute tour for judges

Hexorcist checks small ATmega328P programs before they go on a board. Scripted, seeded gremlins poke a program's inputs on an emulated chip, and a broken rule becomes a short replay. Every path below was listed and every command was run while writing this page.

## 1 minute: the live app

Open https://lainx06.github.io/Hexorcist/. **Crosswalk** is selected.
1. Press **Unleash gremlins**. The rule "cars and walkers must never get a green at the same time" breaks.
2. Press **See the fix work**. The same moves play on the original and the fixed program.
3. Press **Change setup**, then **Your own program**, then **Try a chat-written sketch**, then **Unleash gremlins**.
4. Press **Change setup**, then **Your own program**, then **Try one it can't check**, then **Unleash gremlins**.

## 2 minutes: a terminal

`npm ci`, then `npm run check -- --example crosswalk` (exit code 1):
```
BROKE
Rule broken: all of (CAR_GREEN is 1, WALK is 1) must never happen. at cycle 15647543
Try 4 of 24, seed 20261101
Moves: 8 to 3 (the smallest replay this reducer found)
Fingerprint: 47078989121ebc1d
Reduced moves:
  {"signal":"REQUEST","value":0,"cycle":8449937,"gremlinId":"masher"}
  {"signal":"REQUEST","value":"release","cycle":9496850,"gremlinId":"masher"}
  {"signal":"REQUEST","value":0,"cycle":10543764,"gremlinId":"masher"}
```
`npm run check -- --example crosswalk --fixed` (exit code 0):
```
HELD
No violation found in 24 emulated runs of this gremlin set. Not a proof.
```
`npm run check -- --example crosswalk --fixed --json` (exit code 0):
```
{
  "toolVersion": "0.0.0",
  "verdict": "HELD",
  "seed": 20261101,
  "runs": 24,
  "gremlins": [
    "masher"
  ],
  "rules": [
    "all of (CAR_GREEN is 1, WALK is 1) must never happen."
  ],
  "n": 24,
  "text": "No violation found in 24 emulated runs of this gremlin set. Not a proof."
}
```
`npm run check -- --example crosswalk --json` (exit code 1) prints a longer object. It has the same layout, with `"verdict": "BROKE"`, `"try": 4`, `"movesBefore": 8`, `"movesAfter": 3`, the same fingerprint, the `violation`, the three `reducedList` moves and an `outputEdges` list of pin changes.

## 2 minutes: `.kiro/`

- **17 spec folders** in [`.kiro/specs/`](../.kiro/specs/). Three specs rebuilt the code written outside Kiro: `headless-runner` (command line, GitHub Action, MCP server, hook scripts, power), `upload-samples` (web-app additions) and `benchmark-tools` (benchmark scripts).
- **5 steering files** in [`.kiro/steering/`](../.kiro/steering/): determinism, verdicts, scope-and-ip, testing, product.
- **5 hooks** in [`.kiro/hooks/`](../.kiro/hooks/):
  - `guard-before-task` runs `node scripts/guard.mjs` before a spec task.
  - `engine-tests-on-save` runs `npx vitest --run` when a file in `src/engine/` is saved.
  - `examples-on-save` rebuilds the examples and runs `tests/examples` when an example `.ino` is saved.
  - `hexorcist-check-on-stop` builds and checks the demo sketch when the agent stops.
  - `hexorcist-done-guard` blocks marking a spec task done until the recorded verdict is HELD.
- Note: If you open this repo in Kiro, the hexorcist-done-guard hook blocks marking a spec task done until the Stop hook has recorded HELD for the current .hex, which needs the sketch compiler installed. To look around without it, turn the hook off in the Agent Hooks panel.
- **Custom agent** [`rule-skeptic`](../.kiro/agents/rule-skeptic.md): read-only, opens with "Advice, not a verdict."
- **Power and MCP server**: [`power/hexorcist/`](../power/hexorcist/) and [`mcp/`](../mcp/), with the tools `check` and `capabilities`.

For details, and the disclosure about code originally written with another AI coding assistant, see [HOW-KIRO-BUILT-THIS.md](HOW-KIRO-BUILT-THIS.md).

## Evidence

- CI workflows in [`.github/workflows/`](../.github/workflows/): `ci.yml`, `gate-demo.yml`, `pages.yml`.
- Benchmark of AI chat sketches: [exorcism-demo/benchmark/README.md](../exorcism-demo/benchmark/README.md).
- Seed sweep, 600 checks: [README, Seed sweep](../README.md#seed-sweep).

## Limits

See [Limits, up front](../README.md#limits-up-front). HELD is not a proof.
