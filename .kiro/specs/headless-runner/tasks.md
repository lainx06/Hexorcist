# Implementation Plan: Headless Runner

## Overview

TypeScript only. One Input_Loader and one `runCheck` feed the CLI, the MCP server, the Action and the hooks. No new npm packages. Property tests from the design are written inside the task that builds the code they test, with `fast-check` and at least 100 iterations each, tagged `Feature: headless-runner, Property N: <title>`. Tests are evidence, not proof.

## Tasks

- [ ] 1. CLI: input loader, runCheck and main
  - Create `cli/input-loader.ts` (`loadInput`, `CheckArgs`, `CheckInput`, `LoadResult`), reading files with `node:fs`, stripping BOM and CR from HEX text, taking defaults from `meta.json` or `UPLOAD_DEFAULTS` and `msToCycles`, and rejecting bad combinations before any file read.
  - Create `cli/run-check.ts` (`runCheck(input, jobs = host)`): one `runCampaignJob`, then `runReductionJob` and `runReplayJob` only on BROKE.
  - Create `cli/main.ts` (`main(argv, io)`, catches every thrown error) and `cli/bin.ts`. Add only the `check` and `mcp` scripts to `package.json`; leave dependency lists unchanged.
  - Property tests in `tests/cli/`:
    - **Property 4: Bad input starts no run**. Unknown gremlin, `--example` mixed with `--hex`/`--pins`/`--rules`, `--fixed` without `--example`, or a non-integer number gives a loader failure, a stubbed `runCheck` is never called, and `main` returns 3.
    - **Property 5: Jobs run only as the verdict needs**. Campaign stub called once; reduction and replay stubs called once on BROKE and never otherwise.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 8.1, 8.2, 8.3, 8.4_

- [ ] 2. JSON output and exit codes
  - In `cli/run-check.ts` add `toJson` (object literals in the design's fixed key order, `JSON.stringify(obj, null, 2) + "\n"`, no BOM, no CR), `toSummary` (BROKE text says "the smallest replay this reducer found"), and `exitCodeOf` (0 HELD, 1 BROKE, 2 COULDN'T TELL, 3 loader or job error).
  - Wire `--json` in `main` so stdout holds exactly one Result_Object; errors go to stderr with no verdict string.
  - Property tests in `tests/cli/`:
    - **Property 1: Serialization is deterministic and stable**. Same string on repeat calls, key order matches the design table, no BOM, no CR, one trailing LF, parses back to the object.
    - **Property 2: Exit code follows the verdict**. Total over outcomes and loader failures; exit 3 prints none of the three verdict strings on stdout.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 3. Determinism test
  - Add `tests/cli/determinism.test.ts`: run `main` with `--json` twice on the same example and compare stdout bytes; check no timestamp, absolute path, host name or duration appears in the output.
  - Compare the reported fingerprint with the one `runReplayJob` gives on the page's test path (`tests/ui/examples-host.acceptance.test.ts`).
  - Check `node scripts/guard.mjs` reports zero findings for `cli/` (confirm the guard scans that folder; if it does not, report it rather than editing the guard silently).
  - _Requirements: 2.5, 2.7, 3.3, 3.4, 9.6_

- [ ] 4. GitHub Action
  - Create `action.yml`: composite action `hexorcist-gate`, required inputs `hex`, `pins`, `rules`, optional `gremlins`, `runs`, `seed`.
  - Steps: validate inputs (write reason to `$GITHUB_STEP_SUMMARY` and exit 1), `npm ci` in `github.action_path`, run the CLI with `set +e` and save the exit code, write the summary, then fail the job unless the code is 0. Later steps only run if `npm ci` succeeded.
  - Create `cli/step-summary.ts` (Markdown with verdict, exit code, seed, runs) and a unit test for it.
  - Smoke test: `action.yml` has the three required inputs and the optional three.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 5. MCP server
  - Create `mcp/server.ts` (`handleMessage(msg, deps)`, hand-written JSON-RPC 2.0) and `mcp/bin.ts` (newline-delimited stdin and stdout, diagnostics to stderr). Import `cli/input-loader.ts` and `cli/run-check.ts`, never `cli/main.ts`.
  - Tools: `check` (text is the CLI's `toJson` output) and `capabilities` (5 sentence forms, gremlin ids from `GREMLIN_CATALOGUE`, unmodelled peripherals). If `rule-box.ts` does not load under `tsx`, move the five templates into a pure module.
  - Errors: `-32700`, `-32600`, `-32601`, `-32602`; a job error returns `isError: true`; the loop keeps answering later requests.
  - Property test in `tests/mcp/`:
    - **Property 3: CLI and MCP agree**. For valid `CheckArgs` and a stubbed `runCheck`, the MCP `check` text equals `main --json` stdout.
  - Unit tests for `tools/list` (exactly `check` and `capabilities`) and each error code.
  - _Requirements: 2.6, 2.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.5_

- [ ] 6. Hook files
  - Create `cli/hook-stop.ts` and `cli/hook-guard.ts`, the state file `.hexorcist/last-verdict.json` (add `.hexorcist/` to `.gitignore`), and the config `.hexorcist/check.json`.
  - Create `.kiro/hooks/hexorcist-stop.json` and `.kiro/hooks/hexorcist-guard.json` using only the fields in existing hook files and shell-command actions. Read the PreToolUse payload from a real example to fix the matcher (Open Point in the design).
  - Stop hook prints one verdict line, or "No check ran" with the reason and no verdict string. Guard exits 2 unless the verdict is HELD and the HEX hash matches; it starts no emulator and makes no network call.
  - Property test in `tests/cli/`:
    - **Property 6: The Pre Tool Use guard allows only a current HELD**. Over missing, malformed, any verdict, matching or differing hash: exit 0 only for HELD with a matching hash, else exit 2.
  - Smoke test: hook files use only the allowed fields.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 7. README section
  - Add a "Headless runner" section to `README.md`: CLI flags and exit codes, `--json`, the Action inputs, the MCP tools and start command, and the two hooks. Plain, friendly wording. Do not use the words safe, secure, guaranteed, certified, real-time, first, unique or shortest.
  - Add a text scan test over new user-facing strings and the README section for those banned words.
  - _Requirements: 8.6_

- [ ] 8. Final acceptance task (Requirement 9)
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

## Notes

- No optional tasks. Property tests sit inside the task that builds the code they cover.
- Checkpoint: after each task, run `vitest --run` for the files it touched.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3", "4", "5", "6"] },
    { "id": 3, "tasks": ["7"] },
    { "id": 4, "tasks": ["8"] }
  ]
}
```
