# Implementation Plan: Headless Runner

## Overview

TypeScript only (plus plain Node `.mjs` for the demo build script, and the inline `node -e` Launcher script held as a string in the Power's `mcp.json`). One Input_Loader and one `runCheck` feed the CLI, the MCP server, the Action and the two hook commands. No new npm packages: `dependencies` and `devDependencies` stay unchanged, and `package.json` gains only the `check` and `mcp` scripts. The two existing hook files `.kiro/hooks/hexorcist-check-on-stop.json` and `.kiro/hooks/hexorcist-done-guard.json` stay byte-for-byte unchanged; no new hook file is created.

Every line of code, config, workflow and text in this plan is written fresh by Kiro. Nothing is restored from git history, from an earlier branch, or from a stash.

Property tests from the design are written inside the task that builds the code they test, with `fast-check` and at least 100 iterations each, tagged `Feature: headless-runner, Property N: <title>`. Tests are evidence, not proof.

## Tasks

- [x] 1. CLI foundation: paths, entry point, loader, runCheck, main, scripts
  - [x] 1.1 Entry-point check, path resolution and Input_Loader
    - Create `cli/entry.ts` with `isEntryPoint(moduleUrl, argv1)`: resolve both paths, turn backslashes into slashes, compare lowercase.
    - Create `cli/input-loader.ts` (`loadInput`, `CheckArgs`, `CheckInput`, `LoadResult`, `LoaderEnv`, `invocationDirOf`, `resolveUserPath`, `resolveRepoPath`, `parseLoopConfig`, `configToArgs`, one shared comma-separated gremlin splitter). Read files with `node:fs`, strip BOM and CR from HEX text, take defaults from `meta.json` or `UPLOAD_DEFAULTS` and `msToCycles`, order gremlins by `GREMLIN_CATALOGUE`, and reject bad combinations before any file read.
    - Path rules: user paths (`--hex`, `--pins`, `--rules`, MCP `check` input, hook argument) resolve against `INIT_CWD` when set and non-empty, else the working directory; bundled examples, Loop_Config paths and `.hexorcist/` files resolve against the repo folder computed from the module location.
    - Property tests in `tests/cli/`:
      - **Property 4: Bad input starts no run**. Unknown gremlin, `--example` mixed with `--hex`/`--pins`/`--rules`, `--fixed` without `--example`, or a non-integer number gives a loader failure.
      - **Property 6: Paths resolve against the right folder**. User paths equal `path.resolve(invocationDir, p)`; repo paths do not change with `invocationDir`; `invocationDirOf` prefers a non-empty `INIT_CWD`.
      - **Property 7: Entry-point check ignores case and separators**. True for case and separator variants, false for any other difference.
      - **Property 13: Loop_Config parsing and gremlin lists**. Valid config parses to the same values; removing or mistyping a key fails with a reason naming it; `--gremlins a,b,c` and the config string give the same set.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 8.3, 8.5, 13.6, 14.1_

  - [x] 1.2 runCheck, main and bin
    - Create `cli/run-check.ts` (`runCheck(input, jobs = host)`, `CheckOutcome`): one `runCampaignJob`, then `runReductionJob` and `runReplayJob` only on BROKE. A failed or throwing job returns the job name and error with no verdict.
    - Create `cli/main.ts` (`main(argv, io)`, catches every thrown error, prints one stderr line, returns 3) and `cli/bin.ts` (runs only when `isEntryPoint` is true).
    - Property test in `tests/cli/`:
      - **Property 5: Jobs run only as the verdict needs**. Campaign stub called once; reduction and replay stubs called once on BROKE and never otherwise.
      - Also check with a stubbed `runCheck` that `main` returns 3 and never calls it when the loader fails (Property 4, `main` half).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.3, 8.4_

  - [x] 1.3 npm scripts with --no-deprecation
    - Edit `package.json`: add exactly `"check": "tsx --no-deprecation cli/bin.ts"` and `"mcp": "tsx --no-deprecation mcp/bin.ts"`. Leave both dependency lists unchanged.
    - Smoke tests in `tests/cli/`: dependency lists equal the committed ones, exactly two new scripts, both with `--no-deprecation`; `npm run check -- --example heartbeat --fixed` prints no `DeprecationWarning` on stdout or stderr (evidence for this machine's Node and tsx only).
    - Owner-approved (Nov 24, 2026): the package.json test no longer compares against `git show HEAD:package.json`. It asserts explicitly: scripts "check" and "mcp" exist with the exact values; the other scripts equal an explicit list written in the test; `dependencies` and `devDependencies` equal explicit snapshots written in the test.
    - _Requirements: 8.1, 8.2, 14.2, 14.3_

- [x] 2. JSON output, exit codes and reasonTruncated
  - [x] 2.1 toJson, toSummary, exitCodeOf and --json
    - In `cli/run-check.ts` add `toJson` (object literals in the design's fixed key order, `JSON.stringify(obj, null, 2) + "\n"`, no BOM, no CR, no timestamp, absolute path, host name or duration), `toSummary` (BROKE text says "the smallest replay this reducer found"; HELD prints the exact HELD_Text with the real N; COULDN'T TELL names the cause), and `exitCodeOf` (0 HELD, 1 BROKE, 2 COULDN'T TELL, 3 loader or job error).
    - Wire `--json` in `main` so stdout holds exactly one Result_Object; errors go to stderr with no verdict string.
    - Property tests in `tests/cli/`:
      - **Property 1: Serialization is deterministic and stable**. Same string on repeat calls, key order matches the design table, no BOM, no CR, one trailing LF, parses back to the object.
      - **Property 2: Exit code follows the verdict**. Total over outcomes and loader failures; exit 3 prints none of the three verdict strings on stdout.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.2 reasonTruncated
    - In `cli/run-check.ts` add `isReasonTruncated(reason)` using `REASON_MAX_LENGTH` from `src/engine/verdict.ts` (true when `reason.length >= 200`). Print the engine's reason unchanged and put `reasonTruncated` directly after `reason` in the Result_Object. Do not edit `src/engine/`.
    - Example tests for the boundaries: 199 units, 200 units uncut (documented blind spot, reads true), 201 units cut, and a surrogate-pair cut at 199 units (documented blind spot, reads false).
    - Property test in `tests/cli/`:
      - **Property 8: reasonTruncated reports the engine's cut**. With generated ASCII inputs through `computeVerdict`, avoiding an untruncated length of exactly 200, the flag is true exactly when the full text is over 200 units, the printed reason equals the engine's string, and its length is at most 200.
    - _Requirements: 3.7, 3.9, 3.10_

- [x] 3. Guard script coverage and determinism test
  - [x] 3.1 Extend scripts/guard.mjs
    - Edit `scripts/guard.mjs` in its existing style (`walk`, `scan`, `file:line: message`, exit 2 on findings, "0 findings" when clean): scan `.ts`, `.mjs`, `.json`, `.md`, `.yml` under `cli/`, `mcp/` and `power/` for claim words; scan `.ts` and `.mjs` under `cli/` and `mcp/` for `Date.now`, `new Date`, `performance.now`, `setTimeout`, `setInterval`, `Math.random`; and for `fetch`, `XMLHttpRequest`, `WebSocket` and imports of `http`, `https`, `net`, `dgram`, `dns` (with or without `node:`).
    - Tests in `tests/`: run a temporary copy of the script over a fake layout with a banned word, a clock call and a `node:http` import, and expect findings with file, line and word and a non-zero exit; a clean fake layout gives zero findings and exit 0. The real repo is not touched by these tests.
    - _Requirements: 2.7, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 3.2 Determinism test
    - Add `tests/cli/determinism.test.ts`: run `main` with `--json` twice on the same example and compare stdout bytes; check no timestamp, absolute path, host name or duration appears.
    - Compare the reported fingerprint with the one `runReplayJob` gives on the page's test path (`tests/ui/examples-host.acceptance.test.ts`).
    - Run `node scripts/guard.mjs` and report the findings for `cli/` (zero expected). If a finding appears, report it rather than editing the guard silently.
    - _Requirements: 2.5, 2.7, 3.3, 3.4, 9.6_

- [x] 4. GitHub Action and gate demo
  - [x] 4.1 action.yml and action-report
    - Create `action.yml`: composite action `hexorcist-gate`, required inputs `hex`, `pins`, `rules`, optional `gremlins`, `runs`, `seed`, outputs `verdict` and `exit-code`.
    - Steps: validate inputs (reason to `$GITHUB_STEP_SUMMARY`, exit 1), `npm ci` in `github.action_path` (reason to the summary on failure), run the CLI with `set +e` using absolute paths resolved against `$GITHUB_WORKSPACE`, save the exit code, run the report step, then fail the job unless the code is 0.
    - Create `cli/action-report.ts`: read the CLI's JSON file and exit code, append the Markdown summary (verdict, exit code, seed, runs, or the stderr reason for code 3) to `$GITHUB_STEP_SUMMARY`, append `verdict=` and `exit-code=` to `$GITHUB_OUTPUT` before the failing step. Unit test it with temp files.
    - Smoke test: `action.yml` has the three required inputs, the three optional inputs and the two outputs.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 4.2 gate-demo workflow
    - Create `.github/workflows/gate-demo.yml` (triggers `push` and `workflow_dispatch`, Node version as in `ci.yml`): job `fixed` uses `./` on the Crosswalk fixed build and passes with the Action; job `buggy` uses `./` with `id: gate` and `continue-on-error: true` on the Crosswalk buggy build, then a later step fails the job unless `verdict` is `BROKE` and `exit-code` is `1`, with both values passed through `env:`.
    - No network call other than `actions/checkout`, setup of Node and `npm ci`.
    - Smoke test: the buggy step has `continue-on-error: true` and the later check reads both outputs.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 5. MCP server
  - [x] 5.1 JSON-RPC handler and stdio loop
    - Create `mcp/server.ts` (`handleMessage(msg, deps)`, hand-written JSON-RPC 2.0, no new package) and `mcp/bin.ts` (newline-delimited stdin and stdout, diagnostics to stderr, runs only when `isEntryPoint` is true). Import `cli/input-loader.ts`, `cli/run-check.ts` and `cli/entry.ts`, never `cli/main.ts`. Honour `INIT_CWD` for relative paths.
    - Tools: `check` (text is the CLI's `toJson` output; a job error returns `isError: true` naming the job) and `capabilities` (5 sentence forms, gremlin ids from `GREMLIN_CATALOGUE`, unmodelled peripherals). If `rule-box.ts` does not load under `tsx`, move the five templates into a pure module.
    - Errors: `-32700`, `-32600`, `-32601`, `-32602`; the loop keeps answering later requests.
    - Property test in `tests/mcp/`:
      - **Property 3: CLI and MCP agree**. For valid `CheckArgs` and a stubbed `runCheck`, the MCP `check` text equals `main --json` stdout.
    - Unit tests: `tools/list` returns exactly `check` and `capabilities`, each with a description and input schema; each error code; the loop survives a bad request.
    - _Requirements: 2.6, 2.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.5, 14.1_

- [x] 6. Hook commands, verdict record and demo files
  - [x] 6.1 Verdict record
    - Create `cli/verdict-record.ts`: `serializeRecord` (keys `verdict, exitCode, hexSha256, fingerprint`, LF, one trailing LF), `parseRecord` (returns `null` for anything unreadable or mistyped), `hexSha256` (lowercase SHA-256 of the raw HEX bytes).
    - Property test in `tests/cli/`:
      - **Property 12: Verdict_Record round trip**. `parseRecord(serializeRecord(r))` equals `r`, key order and trailing LF hold, the hash is 64 lowercase hex characters, and invalid text parses to `null`.
    - _Requirements: 7.5, 7.12_

  - [x] 6.2 Demo files and .gitignore
    - Create `exorcism-demo/build.mjs` (plain Node ESM, same `arduino-cli compile -b arduino:avr:uno` invocation as `scripts/build-examples.mjs`, copied rather than refactoring that script; output to `exorcism-demo/build/sketch.hex`; one line and exit 0 on success; compiler output and exit 1 on any failure, including a missing sketch file).
    - Create `exorcism-demo/crosswalk-full-rules.txt` with exactly the seven LF-terminated lines of Requirement 13.4, and `exorcism-demo/loop-check.json` with the values of Requirement 13.5.
    - Edit `.gitignore` to list `.hexorcist/` and `exorcism-demo/build/`.
    - Tests: the rules file bytes match and parse with `readRulesFile`; the config values and `parseLoopConfig` result match; `build.mjs` exit codes with a stubbed compiler on `PATH`; `.gitignore` entries present.
    - _Requirements: 7.17, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 6.3 hook-stop command
    - Create `cli/hook-stop.ts` (`decideStop` pure, `run(argv, io)`, entry-point guarded). It takes `<config> [--block] [--max-blocks N]`, reads the Loop_Config, runs `build` with `spawnSync` and no shell from the repo folder, reads the HEX, runs `loadInput` and `runCheck`, writes the Verdict_Record (creating `.hexorcist/`), prints exactly one verdict line, and keeps the block counter in `.hexorcist/stop-blocks.json`.
    - No-check outcomes (unreadable or incomplete config, failed build, missing HEX, exit-3 outcome): print one "No check ran:" line with the cause, no verdict string, delete any old Verdict_Record, exit 0.
    - Do not create or edit any file in `.kiro/hooks/`. Test that both existing hook files match their committed git blob hashes.
    - Owner-approved (Nov 24, 2026): the hook-file test is reworded. For each of `.kiro/hooks/hexorcist-check-on-stop.json` and `.kiro/hooks/hexorcist-done-guard.json`, the trigger, matcher (where present), action type, command and timeout must equal the committed values (read via `git show HEAD:<file>`). The `enabled` field and trailing whitespace are ignored. Reason: the owner disabled both hooks on purpose until the spec is finished and will re-enable them in the UI; the hooks stay disabled meanwhile.
    - Property test in `tests/cli/`:
      - **Property 11: Stop decision and block counter**. HELD gives exit 0 and counter 0; no `--block` leaves the counter; BROKE or COULDN'T TELL with `--block` gives exit 2 and `count + 1` while `count < max`; at the limit gives exit 0 with `limitReached`; repeated application stops after exactly `max` blocks.
    - Tests with a temp state folder and a stub build: record written, verdict line printed, build failure prints "No check ran:" and removes the record, the fourth block with the default limit exits 0, command lines match the existing hook files.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 14.4_

  - [x] 6.4 hook-guard command
    - Create `cli/hook-guard.ts` (`classifyPayload` and `decideGuard` pure, `run(argv, io)`, entry-point guarded). Write the raw stdin to `.hexorcist/last-pretooluse.json` before deciding. It imports no engine code, starts no emulator, reads no clock and makes no network call. An unreadable Loop_Config on a task-done call counts as an out-of-date record.
    - Property tests in `tests/cli/`:
      - **Property 9: Guard payload classification**. `"task-done"` only for `tool_name` `task_update` with an object `tool_input` whose `status` is `completed` or `done`; everything else is `"other"` and exits 0.
      - **Property 10: The guard allows a done task only on a current HELD**. Over missing, malformed, any verdict, matching or differing hash and a missing HEX: exit 0 only for HELD with a matching hash, else exit 2 with a message that names the verdict, says none is recorded, or says the check is out of date.
    - Tests: a captured `task_update` payload with status `completed` is blocked with no record, blocked on a changed HEX, allowed on a current HELD; every call writes `last-pretooluse.json`; a text scan of the module for clock, random, network and emulator imports.
    - _Requirements: 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16_

- [x] 7. Power and README
  - [x] 7.1 Power at power/hexorcist
    - Create exactly four files: `power/hexorcist/plugin.json`, `mcp.json`, `README.md` and `skills/check-firmware/SKILL.md`. There is no `launch.mjs` and no other launcher file.
    - `mcp.json`: one server with `"command": "node"` and `"args": ["-e", "<inline Launcher script>"]`. It never names `npm`, holds no absolute path, uses no plugin-root variable and references no launcher file. The script is a single dependency-free CommonJS string that reads cleanly as one JSON string.
    - Inline Launcher behaviour: root from `HEXORCIST_ROOT` else the working directory; require `mcp/bin.ts` and the repo's `tsx` entry (`node_modules/tsx/dist/cli.mjs`, or the `bin` field of `tsx/package.json` if the path differs); spawn with `process.execPath`, `--no-deprecation`, `stdio: "inherit"`, `INIT_CWD` set to the repo folder it found, unconditionally (changed by task 10; this task originally set the Launcher's working folder unless already set); on a missing file or spawn error append the cause to `hexorcist-launcher.log` in the OS temp folder, write nothing to stdout, exit non-zero; on child exit, exit with the child's code. No clock, no random, no network, no install.
    - `SKILL.md`: call `capabilities` before any other tool; write rules only in the five forms it returns; call `check` after writing rules; quote HELD_Text word for word; call a BROKE reduced list "the smallest replay this reducer found"; document `reasonTruncated` with the exact sentence "true when the reason reached the 200-character limit, so it may have been cut".
    - `README.md`: that the user sets `HEXORCIST_ROOT` once, how to set it (one PowerShell example, one POSIX shell example), the log file name `hexorcist-launcher.log` and its location in the OS temp folder, and `reasonTruncated` with the same exact sentence.
    - Tests: file list is exactly the four files; `mcp.json` has command `node`, args starting `-e`, no absolute path, no plugin-root variable, no `npm` and no launcher file reference; extract the inline script and run it with `node -e`: `HEXORCIST_ROOT` on an empty temp folder exits non-zero, logs, prints nothing to stdout; `HEXORCIST_ROOT` unset with the working folder at the repo answers `initialize`; `HEXORCIST_ROOT` set to the repo with a different working folder answers `initialize`; text scan of the inline script (clock, random, network, install); text scan of `SKILL.md` for the four instructions; `README.md` and `SKILL.md` each contain the exact `reasonTruncated` sentence; `README.md` names `HEXORCIST_ROOT` and the log file; banned-word scan of all Power text (the guard scans `power/` for banned words, the code-pattern rules for the script string are covered by the text scan).
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14_

  - [x] 7.2 README section and final scans
    - Add a "Headless runner" section to `README.md`: CLI flags and exit codes, `--json`, the Action inputs and outputs, the MCP tools and start command, the two existing hooks and the demo loop, and the Power. Plain, friendly wording. Do not use the words safe, secure, guaranteed, certified, real-time, first, unique or shortest.
    - Add a text scan test over new user-facing strings and the README section for those banned words.
    - Run `node scripts/guard.mjs` on the real repo with `cli/`, `mcp/` and `power/` present and report the result (zero findings expected); report any finding rather than editing the guard silently.
    - _Requirements: 2.7, 8.6, 10.14, 12.1, 12.2, 12.5_

- [x] 8. Final acceptance task (Requirement 9)
  - Write the acceptance tests exactly as below, using the committed HEX files, and run them with `vitest --run`:
    - The CLI on the crosswalk buggy example exits 1 with fingerprint `47078989121ebc1d`, try 4 of 24, and moves 8 to 3.
    - The CLI on the garage buggy example exits 1 with fingerprint `616062947f71a1ae`, try 8 of 40, and moves 7 to 3.
    - The CLI on the heartbeat buggy example exits 1 with fingerprint `19827a4e0a7ad440` and moves 2 to 1.
    - The CLI on each fixed build exits 0 and prints the exact HELD_Text ("No violation found in N emulated runs of this gremlin set. Not a proof." with the real N, "1 emulated run" when N is 1).
    - The CLI on `fixtures/serial_hello` with LED PB5 as output, BUTTON PD2 as input (pressed low), the rule "LED is 1 must never last 500 ms or longer.", and the gremlin masher exits 2 with a reason that names the serial port. The test writes a temporary pins file to the OS temp directory and deletes it afterwards.
    - Two CLI runs with the same inputs print identical JSON, and the fingerprint equals the fingerprint the page shows.
    - A scripted MCP stdio session sends `initialize`, `tools/list`, and `tools/call` for `check`, and the server returns the same JSON as the CLI.
  - Delete any debug scripts before reporting the task done.
  - **Note:** If an acceptance test and the system disagree, stop and report what the test expects, what actually happened, and the evidence (including the trace). Never change, weaken, or delete the test. Wait for the owner's decision.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 9. Power manifests (Agent Plugins 1.0.0)
  - Fix, owner-reported on Nov 24, 2026. Kiro said: "plugin.json has an unsupported or missing $schema".
  - Edit `power/hexorcist/plugin.json`, keeping every existing field. Add `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`, `author`, `keywords`, `homepage` set to `"https://lainx06.github.io/Hexorcist/"`, `repository` set to `"https://github.com/lainx06/Hexorcist"`, and `license` set to `"MIT"`.
  - The owner has not given an author name. Use `"lainx06"` (taken from the repository URL) and flag it in the report so the owner can confirm or replace it.
  - Edit `power/hexorcist/mcp.json`: add `"$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"` and add `"type": "stdio"` to the server entry. The inline Launcher script string is unchanged.
  - Edit `tests/cli/power.test.ts`: add one new test that checks both `$schema` values and the `stdio` server type. Existing tests in that file stay as they are, none weakened or removed.
  - Owner-approved (Nov 24, 2026): the existing test in `tests/cli/power.test.ts` "mcp.json runs node -e with no npm, absolute path, plugin-root variable or launcher file" changes only its Windows-drive-path check. It scans only the `args` strings of the `mcp.json` server entry (not the whole file text) for a drive path, because the required `$schema` URL contains "s:/". Every other check in that test is unchanged.
  - Owner-approved (Nov 24, 2026): `plugin.json` `author` is an object `{"name": "lainx06", "url": "https://github.com/lainx06"}`.
  - Run `npx vitest --run tests/cli/power.test.ts` and `node scripts/guard.mjs`, and report both results (guard: zero findings expected; report any finding rather than editing the guard silently).
  - Delete any debug scripts before reporting the task done.
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 10. Launcher resolves relative paths against the repo folder
  - Fix, owner-reported on Nov 24, 2026. Through the power, `check` failed on relative paths ("Cannot read the file \"exorcism-demo/build/sketch.hex\"") while full paths returned HELD. Kiro starts power MCP servers in its powers folder and the Launcher set `INIT_CWD` to that working folder.
  - Edit the inline Launcher in `power/hexorcist/mcp.json`: set `INIT_CWD` in the child environment to the repo folder it found (`HEXORCIST_ROOT`, or the current-folder fallback), unconditionally. Change nothing else in the script, and keep `$schema` and `"type": "stdio"`.
  - `npm run mcp` and `npm run check` keep their behaviour (npm sets `INIT_CWD`). `cli/input-loader.ts` is not changed.
  - Edit `power/hexorcist/README.md` and `power/hexorcist/skills/check-firmware/SKILL.md`: each says relative paths resolve against the Hexorcist repo folder and to use full paths for files elsewhere. Keep the exact `reasonTruncated` sentence and avoid the Banned_Words.
  - Edit `tests/cli/power.test.ts`: add one new test that runs the real Launcher (extracted from `mcp.json`, run with `node -e`) from a different temp working folder with `HEXORCIST_ROOT` set to the repo, sends `initialize` and a `check` call with a relative hex path, and expects a Result_Object instead of a "Cannot read the file" error. Existing tests stay as they are, none weakened or removed.
  - If any existing test asserts the old `INIT_CWD` behaviour, do not edit it. Report which test, what it expects, what happened, and the evidence, then wait for the owner's decision. A search of `tests/cli/power.test.ts` on Nov 24, 2026 found no such assertion.
  - Run `npx vitest --run tests/cli/power.test.ts` and `node scripts/guard.mjs`, and report both results (guard: zero findings expected; report any finding rather than editing the guard silently).
  - Delete any debug scripts before reporting the task done.
  - _Requirements: 10.4, 10.15, 10.16, 10.17, 10.18_

## Notes

- No optional tasks. Property tests sit inside the task that builds the code they cover.
- Properties 1 to 13 each appear in exactly one task: P1, P2 in 2.1; P3 in 5.1; P4, P6, P7, P13 in 1.1; P5 in 1.2; P8 in 2.2; P9, P10 in 6.4; P11 in 6.3; P12 in 6.1.
- Requirement 14.4 (no deprecation warning from the hook command lines) is checked in 6.3; 14.3 in 1.3.
- Checkpoint: after each task, run `vitest --run` for the files it touched.
- Requirement 7.1: the two existing hook files are never edited and no hook file is added.
- Owner-approved (Nov 24, 2026): tsconfig.node.json include list gains cli and mcp so npm run typecheck checks them directly; errors in cli/ and mcp/ are fixed, src/engine is not changed.
- Requirement 10: the Launcher is the inline `node -e` script in `mcp.json`; no `launch.mjs` exists. Requirements 10.8 to 10.14 follow the updated numbering (10.8 is the `reasonTruncated` sentence, 10.9 to 10.12 the `SKILL.md` instructions, 10.13 the README, 10.14 the banned words).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "6.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1", "4.1", "5.1", "6.2"] },
    { "id": 4, "tasks": ["3.2", "4.2", "6.3", "6.4", "7.1"] },
    { "id": 5, "tasks": ["7.2"] },
    { "id": 6, "tasks": ["8"] },
    { "id": 7, "tasks": ["9"] },
    { "id": 8, "tasks": ["10"] }
  ]
}
```
