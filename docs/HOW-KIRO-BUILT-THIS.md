# How Kiro built Hexorcist

Hexorcist is being built in Kiro during the Kiroween 2026 submission period, starting Nov 12, 2026. This page lists every Kiro feature
the project uses, where it lives in the repository, and what it did. Numbers come from the repository, the
CI runs and Kiro's own credit counter. Anything not yet tried is marked as such.

## At a glance

| Kiro feature | How Hexorcist uses it | Where |
|---|---|---|
| Specs | 15 specs, each with requirements, design and tasks. Kiro wrote all 15 and carried out 14 of them: the emulator bridge, gremlins, rule compiler, reducer, examples, verdicts, the whole web page, and `exorcism-fix` (below). | [`.kiro/specs/`](../.kiro/specs/) |
| Steering | 5 always-on files: determinism, the exact verdict texts, scope, test rules, product. | [`.kiro/steering/`](../.kiro/steering/) |
| Hooks | 5 hooks on 4 different triggers (below). | [`.kiro/hooks/`](../.kiro/hooks/) |
| Custom agent | `rule-skeptic`, read-only, argues with a rule before you run it. Every answer opens with "Advice, not a verdict." ([a run](#the-rule-skeptic-agent-on-a-bad-rule-set-nov-24-2026)) | [`.kiro/agents/rule-skeptic.md`](../.kiro/agents/rule-skeptic.md) |
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
| `hexorcist-done-guard` | Pre Tool Use (`spec` tools) | Blocks marking a spec task done unless the last check of the current program was HELD. Seen blocking Kiro on Nov 24 ([below](#the-done-guard-blocks-a-spec-task-nov-24-2026)). |

## The done-guard blocks a spec task (Nov 24, 2026)

Starting from the same chat-written crossing sketch, recorded as BROKE, Kiro in Spec mode wrote a one-task
spec, `exorcism-fix`, and ran the task (2.47 credits, 1 minute 22 seconds):

1. It checked the sketch with the power: BROKE, WALK and DON'T WALK both on, because `setState()` wrote its
   pins one at a time.
2. It changed `setState()` to switch off the lights that should be off, then switch the others on, and checked
   again: HELD.
3. It tried to mark the task done. The `hexorcist-done-guard` hook blocked the call: the sketch had changed
   since the last recorded check. Kiro read the hook's message, left the task in progress and ended its turn
   so the Agent Stop hook could run the check.

The hook saw the exact call Kiro makes to finish a task: tool `task_update`, with the tasks file, the task
and `status: "completed"`. The guard now matches that call exactly. The `guard-before-task` hook also ran
when the task started.

## The rule-skeptic agent, on a bad rule set (Nov 24, 2026)

Given three rules for the motor demo's pin map and a 1000 ms run, two of them flawed on purpose, the
read-only `rule-skeptic` agent answered in 7 seconds for 0.15 credits, reading files only:

- It opened with "Advice, not a verdict."
- Rule 1 (`all of (FORWARD is 1, REVERSE is 1) must never happen.`): both signals are mapped outputs; useful.
- Rule 2 (`MOTOR is 1 must never happen.`): MOTOR is not in the pin map, and it would not guess a pin.
- Rule 3 (`Within 2000 ms after FWD_BUTTON is 0 becomes true, FORWARD is 1 must be true.`): the trigger can
  happen, but a 2000 ms window never closes inside a 1000 ms run, so a run cannot judge it.
- Gap: nothing covers STOP. It suggested `Within 200 ms after STOP_BUTTON is 0 becomes true, FORWARD is 0
  must be true.` and the same for REVERSE, both in accepted sentence forms.

The same three rules sent to the default agent, which ran the check through the power, came back COULDN'T
TELL with a reason cut at the engine's 200-character limit; the agent then guessed wrongly that the valid
`all of` rule was unsupported. That is why the CLI and MCP output now carry `reasonTruncated`.

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

## Who wrote what

Kiro wrote the web app, the engine and their tests in 13 specs, and wrote the requirements, design and tasks
of spec #14. The author
directed the project, approved every change and ran the browser checks. Claude acted as the planning lead
(spec prompts, review triage, acceptance values, the README, and the starting drafts of the hook, agent and
workflow files, which the author installed and ran in Kiro) and, after Kiro's credit limit, wrote
follow-up code in pull requests the author reviewed and merged. Each of those commit messages ends in
`(claude)`.

Code written by Claude after the Kiro credit limit:

- Upload page: hide analog gremlins on uploads, show the "pick a gremlin" message only after a click, page description and no-script text, and the "Try one it can't check" sample.
- Terminal runner (`cli/`), built from Kiro spec #14 `headless-runner` (`.kiro/specs/headless-runner/`): `npm run check`, JSON output, exit codes, and its tests in `tests/cli/`; the GitHub Action (`action.yml`, `cli/step-summary.ts`, `gate-demo.yml`) and the MCP server (`mcp/`), with tests in `tests/mcp/`.
- Hook commands for the Exorcism Loop (`cli/hook-stop.ts`, `cli/hook-guard.ts`), the `exorcism-demo/` device files, and two plain C test programs for it (`tests/cli/conveyor/`).
- The Kiro power files (`power/hexorcist/`: `plugin.json`, `mcp.json`, the `check-firmware` skill).
- "Try a chat-written sketch" and the microsecond wording in stories; the fix view's HELD headline; the
  COULDN'T TELL screen copy.

## Credits

About 3,940 of the 4,000 Kiro credits were used on the specs and on follow-up fix passes. The upload-path
spec used about 200, spec #14 used 12.4, the power's capabilities test 0.12, and the Exorcism Loop 0.58.
