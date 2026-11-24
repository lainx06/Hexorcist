# How Kiro built Hexorcist

Hexorcist is being built in Kiro during the Kiroween 2026 submission period, starting Nov 12, 2026. This page lists every Kiro feature
the project uses, where it lives in the repository, and what it did. Numbers come from the repository, the
CI runs and Kiro's own credit counter. Anything not yet tried is marked as such.

## At a glance

| Kiro feature | How Hexorcist uses it | Where |
|---|---|---|
| Specs | 14 specs, each with requirements, design and tasks. Kiro wrote all 14 and built the code for 13 of them (the emulator bridge, gremlins, rule compiler, reducer, examples, verdicts and the whole web page). | [`.kiro/specs/`](../.kiro/specs/) |
| Steering | 5 always-on files: determinism, the exact verdict texts, scope, test rules, product. | [`.kiro/steering/`](../.kiro/steering/) |
| Hooks | 5 hooks on 4 different triggers (below). | [`.kiro/hooks/`](../.kiro/hooks/) |
| Custom agent | `rule-skeptic`, read-only, argues with a rule before you run it. Every answer opens with "Advice, not a verdict." | [`.kiro/agents/rule-skeptic.md`](../.kiro/agents/rule-skeptic.md) |
| Power | `hexorcist`: the `check-firmware` skill plus a local MCP server, installed from a folder. | [`power/hexorcist/`](../power/hexorcist/) |
| MCP | The power's server exposes `check` and `capabilities`; in Kiro the calls show as `@hexorcist/hexorcist/<tool>`. | [`mcp/`](../mcp/) |

## Specs: from sentence to code

Each spec went requirements → design → tasks → code, with property tests written inside the task that
built the code they test. Two of the 14 are bugfix specs. `input-pullup` came from a real emulator issue
found on day one: an unconnected button with a pull-up resistor read as pressed.

Spec #14, `headless-runner`, is the exception: Kiro wrote its requirements, design and tasks (12.4 credits),
and after Kiro's credit limit Claude implemented the tasks in pull requests the owner reviewed. Each task
in [its `tasks.md`](../.kiro/specs/headless-runner/tasks.md) names the pull request that built it.

## Steering: rules Kiro could not forget

- `determinism.md`: the checker counts CPU cycles and uses a seeded random generator; no clock, no
  network, no AI in the verdict path.
- `verdicts.md`: exactly three answers, BROKE, HELD and COULDN'T TELL, with the exact HELD text
  ("No violation found in N emulated runs of this gremlin set. Not a proof.").
- `scope-and-ip.md`, `testing.md`, `product.md`: what is in scope, how tests are written (and that a failing
  acceptance test is reported, never weakened), and the words the product may not use about itself.

## Hooks

| Hook | Trigger | What it does |
|---|---|---|
| `guard-before-task` | Pre Task Execution | Runs `scripts/guard.mjs` before every spec task; blocks the task if copy uses a banned claim word or engine code reads the clock. It blocked a real task once, when a design doc listed the banned words. |
| `engine-tests-on-save` | File Save | Runs the engine tests whenever Kiro edits engine code. |
| `examples-on-save` | File Save | Recompiles the example sketches and runs their tests whenever Kiro edits one. |
| `hexorcist-check-on-stop` | Agent Stop | When the agent finishes, builds the demo sketch and runs the same check as `npm run check`; prints one verdict line, which Kiro adds to the agent's context. |
| `hexorcist-done-guard` | Pre Tool Use (`spec` tools) | Blocks marking a spec task done unless the last check of the current program was HELD. Not yet seen firing on a real "task done" call. |

## The Exorcism Loop (Nov 23, 2026)

We asked four chat AIs, on fast and on high-thinking settings, to write a pedestrian-crossing sketch from
one fixed brief, and checked all eight against seven rules that restate the brief
([benchmark](../exorcism-demo/benchmark/README.md)). All eight broke the same rule: each one switches WALK
on about 5 microseconds before it switches DON'T WALK off.

Then Kiro got one of them (GPT-6, high thinking, unedited) with the hexorcist power:

1. Kiro built it and called the power's `check` tool: **BROKE**, WALK and DON'T WALK both on.
2. It swapped the two writes and checked again: **BROKE**, car green and car red both on at the end of the
   crossing.
3. It changed the light helper to switch each light off before the next one on: **HELD**, and it quoted the
   HELD text word for word.
4. When it finished, the Agent Stop hook ran.

45 seconds, 0.58 credits. The fixed sketch then held 200 tries with two gremlins, and a replay shows WALK
and DON'T WALK never on together.

## What surprised us

Kiro's file hooks fire on the agent's own edits, not on the person's. So the agent checks its own work,
and the person can edit right next to it without setting anything off.

## AI development strategy

- **Roles.** Kiro was the builder. Claude was the planning lead: spec prompts, review triage, acceptance
  values, and after the credit limit the follow-up code, disclosed commit by commit. ChatGPT, Gemini and
  DeepSeek gave outside reviews. The owner approved every change and every push.
- **AI builds the tool; no AI judges the firmware.** The checker is deterministic: the same program, rules
  and seed always give the same verdict, the same replay and the same fingerprint, in the browser, the
  terminal, CI and MCP.
- **Pinned acceptance values.** Each example has a pinned fingerprint, try number and replay length. A
  spec could not finish by editing them; a mismatch had to be reported with evidence.
- **Honest verdicts.** HELD always says "Not a proof", and a program that uses a chip part the emulator
  does not model gets COULDN'T TELL instead of a pass.

## Credits

About 3,940 of the 4,000 Kiro credits were used on the specs and on follow-up fix passes. The upload-path
spec used about 200, spec #14 used 12.4, the power's capabilities test 0.12, and the Exorcism Loop 0.58.
