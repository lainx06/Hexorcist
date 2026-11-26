# How Kiro built Hexorcist
This page lists the Kiro features the repository uses, where each one lives, and what the files show. It says only what the files and the git history show. Nothing here is a claim about how much time or how many credits anything took, because the repository does not record that.
## Disclosure: code originally written with another AI coding assistant
Some code was originally written with another AI coding assistant, not with Kiro. That code was the command-line runner (`cli/`), the MCP server (`mcp/`), the Kiro power (`power/hexorcist/`), the hook scripts (`cli/hook-stop.ts`, `cli/hook-guard.ts`), the GitHub Action (`action.yml`, `.github/workflows/gate-demo.yml`), the benchmark scripts (`exorcism-demo/`), and a few text changes in the web app.
On Nov 24, 2026, one commit removed all of it: `5d54110`, "Remove code written outside Kiro; Kiro rebuilds it next (see README)". It changed 77 files. Kiro then rebuilt the code from its own specs:
| Spec | What it rebuilt | Commit |
|---|---|---|
| `headless-runner` | CLI, JSON output, GitHub Action, MCP server, hook scripts, power | `6a081de` |
| `upload-samples` | The two extra sample programs, the microsecond wording, the fixed-program headline, the COULDN'T TELL screen text | `175f7f0`, then `3c8a85c` (task 15) |
| `benchmark-tools` | `exorcism-demo/try.mjs`, `measure-overlap.ts`, the config files, the motor files, the benchmark README | `5c69c37` |
The header of `headless-runner/tasks.md` says the plan was written "fresh by Kiro" and that nothing was restored from git history, an earlier branch or a stash. The git history still holds the earlier versions and shows which commits the other assistant made.
The same assistant also planned or drafted other work on this repo: spec prompts, the steering files, drafts of the hook, agent and workflow files, review triage and acceptance checks. Those files are in this repository now.

The GIF in the README and the demo video were made outside Kiro, from recordings of the app and of Kiro. They are media, not code.
## At a glance
| Kiro feature | What the repository has | Where |
|---|---|---|
| Specs | 17 spec folders | [`.kiro/specs/`](../.kiro/specs/) |
| Steering | 5 files, all `inclusion: always` | [`.kiro/steering/`](../.kiro/steering/) |
| Hooks | 5 hook files on 4 triggers | [`.kiro/hooks/`](../.kiro/hooks/) |
| Custom agent | `rule-skeptic`, read-only | [`.kiro/agents/rule-skeptic.md`](../.kiro/agents/rule-skeptic.md) |
| Power and MCP | `hexorcist` power with a stdio MCP server and one skill | [`power/hexorcist/`](../power/hexorcist/), [`mcp/`](../mcp/) |
| Benchmark | Sketches from AI chat tools, checked with the runner | [`exorcism-demo/benchmark/`](../exorcism-demo/benchmark/README.md) |
## Specs
Every spec folder has `design.md` and `tasks.md`. Fifteen have `requirements.md` and two, the bugfix specs, have `bugfix.md` instead. Sixteen have a `.config.kiro` file that names the spec type (feature or bugfix) and the workflow. Twelve have a `tasks.meta.json` that records, for each task, an execution id, a chat session id and a timestamp.
| Spec | What it is |
|---|---|
| `emulator-bridge` | The only module that imports avr8js. Loads a HEX, runs it at 16 MHz, turns pin changes into cycle-stamped events, applies input events at exact cycles. |
| `bridge-output-scan` | A speed change that must not change behaviour. It holds `BASELINE-HASH.txt` (a SHA-256 taken Nov 15, 2026). |
| `input-pullup` | Bugfix. With a pull-up resistor and nothing connected, a button read as pressed. |
| `gremlin-engine` | Seeded input disturbances and the Campaign of runs. |
| `rule-compiler` | Turns the plain-English rule sentences into a JSON form, then into one deterministic checker. |
| `trace-reducer` | Shrinks a BROKE trace; also the plain failure story and the fingerprint. |
| `example-firmware` | The buggy and fixed example sketches, their pin maps, rules and campaign settings. |
| `honest-verdicts` | Unmodelled-peripheral detection, so a program that uses one gets COULDN'T TELL. Its `report-notes.md` records a calibration run. |
| `held-text` | Bugfix. The HELD text did not say "emulated" and read "1 runs" for one run. |
| `bench-ui-core`, `bench-ui-examples`, `bench-ui-stage`, `bench-ui-upload` | The web app, in four stages: the Crosswalk flow, the three-example gallery and plain view, the stage layout, and the "Your own program" path. |
| `headless-runner` | The terminal check, Action, MCP server, hook scripts and power. All 24 task lines are ticked. |
| `upload-samples` | Small web-app additions. All 45 task lines are ticked; none are unticked. |
| `exorcism-fix` | One task: edit `exorcism-demo/sketch/sketch.ino` until the check says HELD. The commit message for `6d68c45` says the done-guard hook blocked task completion until the check was re-run. That done-guard run used the earlier hook scripts, which were removed in `5d54110` and rebuilt by Kiro in `6a081de`. |
| `benchmark-tools` | The benchmark scripts and README. All 37 task lines are ticked; none are unticked. |
`upload-samples/requirements.md` names one allowed test change (the expected text in Property 21 of `tests/ui/plain-story.property.test.ts`, for spans under 8000 cycles only), and says acceptance tests written by the user must not be changed, weakened or deleted to make them pass.
The `headless-runner` plan says its property tests use fast-check, with at least 100 iterations each, tagged like `Feature: headless-runner, Property N: <title>`. Tests are evidence, not proof.
## Steering
Five files, each marked `inclusion: always`:
- `determinism.md`: time is integer CPU cycles; all randomness comes from one seeded generator passed in explicitly; replay is a fresh emulator with the same HEX, fixture and event list; the checker has no AI and makes no network call.
- `verdicts.md`: the exact verdict strings. HELD reads "No violation found in N emulated runs of this gremlin set. Not a proof." The reducer's output is called "the smallest replay this reducer found".
- `scope-and-ip.md`: ATmega328P at 16 MHz through avr8js only, no compile server, avr8js behind an `EmulatorBridge` interface, TypeScript, Vite, GitHub Pages, original art only.
- `testing.md`: an acceptance test written into a prompt or spec is never changed, weakened or deleted to make it pass; disagreements are reported and wait for a decision. Debug scripts are deleted before a task is reported done. Tests are evidence, not proof.
- `product.md`: what the product is, the voice, and the words it may not use about itself.
## Hooks
| File | Trigger | Matcher | Command |
|---|---|---|---|
| `guard-before-task` | `PreTaskExec` | none | `node scripts/guard.mjs` |
| `engine-tests-on-save` | `PostFileSave` | `src/engine/**/*.ts` | `npx vitest --run` |
| `examples-on-save` | `PostFileSave` | `examples/<name>/buggy` or `fixed` `.ino` files | `node scripts/build-examples.mjs`, then `npx vitest --run tests/examples` |
| `hexorcist-check-on-stop` | `Stop` | none | `npx tsx --no-deprecation cli/hook-stop.ts exorcism-demo/loop-check.json --block` |
| `hexorcist-done-guard` | `PreToolUse` | `spec` | `npx tsx --no-deprecation cli/hook-guard.ts exorcism-demo/loop-check.json` |
- `scripts/guard.mjs` checks for claim words in the app, README, `docs/`, `cli/`, `mcp/` and `power/`; clock, random and network use in engine and runner code; that only `src/engine/emulator-bridge.ts` imports avr8js; and a board brand word in the app. It exits 0 when clean and 2 otherwise.
- `scripts/seed-sweep.mjs` runs the command-line check for every example, build and seed in a range (default 1 to 100) and prints a table of verdict counts, with the seeds that did not give the expected verdict. It exits 0 whatever the verdicts, and 3 on a usage error. Its results are in the README under Seed sweep.
- `hook-stop.ts` builds the demo sketch, runs the check, writes `.hexorcist/last-verdict.json` (verdict, exit code, SHA-256 of the HEX, fingerprint) and prints one line. With `--block`, a BROKE or COULDN'T TELL verdict exits 2 so the agent is sent back to work, up to 3 times in a row (`--max-blocks` changes that). A HELD resets the count.
- `hook-guard.ts` acts only on a `task_update` tool call whose status is `completed` or `done`. It exits 2 unless the recorded verdict is HELD and the recorded HEX hash matches the HEX file now. It sees only Kiro's task tool (`task_update` with status `completed`). A change to `tasks.md` made by a shell command or a file edit is not blocked.
- The two runner hook files currently read `"enabled": true`. `hexorcist-check-on-stop` has a 300-second timeout. The `.hexorcist/` folder is in `.gitignore`.
## The custom agent
`rule-skeptic` has only the `read` tool. Every answer opens with "Advice, not a verdict." It reads the rule and the pin map and says, in at most 12 lines, whether signals are mapped, whether a gremlin can cause the trigger, whether a time limit fits the run length, and what the rule leaves out. It never says BROKE, HELD or COULDN'T TELL as a result.
## The power and the MCP server
`power/hexorcist/` holds `plugin.json`, `mcp.json` (a small Node launcher that starts `mcp/bin.ts` from `HEXORCIST_ROOT`, and logs failures to `hexorcist-launcher.log` in the temp folder) and `skills/check-firmware/SKILL.md`. The server (`mcp/server.ts`) speaks JSON-RPC over stdio and has two tools: `check` and `capabilities`. The skill tells the agent to call `capabilities` before any other tool, write rules only in the five sentence forms, call `check`, and report the result as it came back: the HELD text word for word, the trace for BROKE, the reason for COULDN'T TELL.
`reasonTruncated` is in the JSON and in the power's README: true when a reason reached the 200-character limit.
## The benchmark
`exorcism-demo/benchmark/README.md` holds two briefs, one for a pedestrian crossing (round 2) and one for a motor driven through two switches (round 3), and the unedited sketches that AI chat tools wrote for them, eight per round. It also keeps four sketches from an earlier brief that are not in the results.
- Tools: `exorcism-demo/try.mjs` copies one sketch into the work folder, builds it and runs the headless checker with a config file. `exorcism-demo/measure-overlap.ts` counts CPU cycles during which two outputs are on together.
- Configs: `crosswalk-check.json` (Masher, 24 runs), `crosswalk-full-check.json` (Masher and Bouncer, 200 runs) and `motor-check.json` (Masher and Bouncer, 200 runs), all with seed 20261101.
- Results: crossing with one rule, 8 of 8 HELD. Crossing with the full rule set, 8 of 8 BROKE on try 1, with a WALK and DONT_WALK overlap of 73 to 78 cycles (4.56 to 4.88 microseconds). Motor, 1 BROKE (`chatgpt-fast`, try 159) and 7 HELD.
- The README says why `chatgpt-fast` missed the short STOP press: from reading the code, a `delay(10)` in its loop. It marks this as read from the code, not measured.
- `round2/chatgpt-high-kiro-fixed.ino` is a hand-fixed copy and is not in the tables.
- The web app's "Try a chat-written sketch" sample is `round2/chatgpt-high.hex`.
These are results from one seed and one gremlin set. They are not a proof.
## Other checks in the repository
- `.github/workflows/ci.yml` runs the type check, the guard, all tests and the build on pushes to `main` and on pull requests.
- `.github/workflows/gate-demo.yml` runs the GitHub Action on the crosswalk fixed build (passes) and on the buggy build (passes only if the verdict is BROKE with exit code 1).
- `.github/workflows/pages.yml` runs the guard, builds with Vite and deploys to GitHub Pages.
