# Requirements Document

## Introduction

The headless runner runs the same check as the web page from a terminal, a GitHub Action, an MCP client, and Kiro hooks, and returns identical results in each place. It reuses the page's worker functions, so the fingerprint, try number, and reduced list match the page. Code lives in `cli/` and `mcp/`, with one shared input-loading module.

## Glossary

- **CLI**: The Node command started with `npm run check -- <args>`, run through the existing tsx devDependency.
- **Check_Core**: The shared functions in `src/ui/app/worker/host.ts`: `runCampaignJob`, then on BROKE `runReductionJob` and `runReplayJob`.
- **Input_Loader**: The single module that turns CLI arguments or MCP arguments into a HEX, a pin fixture, a rule list, and a gremlin set.
- **Result_Object**: The JSON object holding verdict, reason or HELD text, runs, seed, gremlin set, try number, moves before and after reduction, fingerprint, and tool version.
- **Action**: The composite GitHub Action `hexorcist-gate` defined in `action.yml` at the repo root.
- **MCP_Server**: The stdio JSON-RPC 2.0 server started with `npm run mcp`.
- **Hook_Files**: The Kiro hook JSON files under `.kiro/hooks/`.
- **HELD_Text**: The string "No violation found in N emulated runs of this gremlin set. Not a proof." with N as the real run count ("1 emulated run" when N is 1).
- **Page**: The Hexorcist web page.
- **Stop_Hook**: The command `cli/hook-stop.ts`, run by the existing file `.kiro/hooks/hexorcist-check-on-stop.json` on the Agent Stop trigger.
- **Guard_Hook**: The command `cli/hook-guard.ts`, run by the existing file `.kiro/hooks/hexorcist-done-guard.json` on the Pre Tool Use trigger with matcher "spec".
- **Loop_Config**: The JSON file `exorcism-demo/loop-check.json` that both hooks receive as their first argument. Its keys are `source`, `build`, `hex`, `pins`, `rules`, `gremlins`, `runs`, `seed`, and `runMs`.
- **Verdict_Record**: The JSON file `.hexorcist/last-verdict.json`, written by the Stop_Hook.
- **Hex_Hash**: The lowercase hexadecimal SHA-256 of the bytes of the HEX file named in the Loop_Config.
- **Demo_Build_Script**: The Node script `exorcism-demo/build.mjs`.
- **Power**: The Kiro power in `power/hexorcist`, in the Agent Plugins format.
- **Launcher**: The inline Node script passed to `node -e` in the Power's `mcp.json`, which starts the MCP_Server. It is not a separate file.
- **Gate_Demo_Workflow**: The GitHub workflow `.github/workflows/gate-demo.yml`.
- **Guard_Script**: The script `scripts/guard.mjs`.
- **Banned_Words**: The words safe, secure, guaranteed, certified, real-time, first, unique, and shortest.
- **Invocation_Folder**: The folder named by the `INIT_CWD` environment variable when it is set, otherwise the current working directory.
- **Reason_Cap**: The 200-character limit on COULDN'T TELL reasons, set by `REASON_MAX_LENGTH` in `src/engine/verdict.ts`.

## Requirements

### Requirement 1: CLI inputs

**User Story:** As a maker, I want to start a check from a terminal, so that I can run it without a browser.

#### Acceptance Criteria

1. WHEN the CLI receives `--example <crosswalk|garage|heartbeat>` without `--fixed`, THE Input_Loader SHALL load that example's buggy HEX, fixture, and rules.
2. WHEN the CLI receives `--example <crosswalk|garage|heartbeat>` with `--fixed`, THE Input_Loader SHALL load that example's fixed HEX, fixture, and rules.
3. WHEN the CLI receives `--hex <file>`, `--pins <fixture.json>`, and `--rules <rules.txt>`, THE Input_Loader SHALL load those three files.
4. WHEN the CLI receives `--gremlins` (a comma-separated list of gremlin ids), `--runs`, `--seed`, or `--run-ms`, THE Input_Loader SHALL apply each given value.
5. WHEN `--example` is used and `--gremlins`, `--runs`, `--seed`, or `--run-ms` is omitted, THE Input_Loader SHALL take the omitted value from that example's `meta.json`.
6. WHEN `--hex`, `--pins`, and `--rules` are used and `--gremlins`, `--runs`, `--seed`, or `--run-ms` is omitted, THE Input_Loader SHALL take the omitted value from the defaults the Page uses for an uploaded program, found in `src/ui/app/model/upload-fields.ts` and `src/ui/app/model/upload-state.ts`.
7. IF an argument names an unknown gremlin id, an unreadable file, or a non-integer number, THEN THE CLI SHALL print a one-line reason to stderr, exit with code 3, and start no run.
8. IF `--example` is combined with `--hex`, `--pins`, or `--rules`, or `--fixed` is given without `--example`, or neither a valid `--example` nor a full `--hex`, `--pins`, `--rules` set is given, THEN THE CLI SHALL print a one-line reason to stderr, exit with code 3, and start no run.
9. WHEN the CLI or the MCP_Server receives a relative file path in `--hex`, `--pins`, `--rules`, or the matching `check` input, THE Input_Loader SHALL resolve that path against the Invocation_Folder.
10. WHEN a hook command receives a relative path as an argument, THE Input_Loader SHALL resolve that path against the Invocation_Folder, and SHALL resolve paths read from the Loop_Config against the repo folder.
11. THE Input_Loader SHALL resolve the paths of the bundled examples against the repo folder, whatever the Invocation_Folder is.

### Requirement 2: Same engine path as the page

**User Story:** As a teacher, I want the terminal result to match the page, so that I can trust one report across tools.

#### Acceptance Criteria

1. THE CLI SHALL call `runCampaignJob` from `src/ui/app/worker/host.ts` exactly once per check.
2. WHEN `runCampaignJob` returns BROKE, THE CLI SHALL call `runReductionJob` once and then `runReplayJob` once.
3. WHEN `runCampaignJob` returns HELD or COULDN'T TELL, THE CLI SHALL call neither `runReductionJob` nor `runReplayJob`.
4. IF a job returns or throws an error, THEN THE CLI SHALL name the failing job in a message on stderr, print no verdict, and exit with code 3.
5. WHEN the CLI and the Page check the same inputs, THE CLI SHALL produce the same verdict, the same N, and the same event order as the Page.
6. THE MCP_Server SHALL run each check through the same Input_Loader and Check_Core calls as the CLI.
7. THE CLI, THE MCP_Server, and THE hook commands SHALL read no clock, call no Math.random, and make no network call, and THE Guard_Script SHALL report zero findings when it scans `cli/` and `mcp/` together with its existing scan targets.

### Requirement 3: Output

**User Story:** As a CI author, I want stable output, so that I can compare runs byte for byte.

#### Acceptance Criteria

1. THE CLI SHALL print a plain-text summary that contains the exact verdict string.
2. WHEN `--json` is given, THE CLI SHALL print exactly one Result_Object on stdout and nothing else on stdout.
3. THE Result_Object and the plain-text summary SHALL contain no timestamp, absolute path, host name, or wall-clock duration.
4. WHEN the same inputs are run on Windows, macOS, or Linux, THE CLI SHALL print byte-identical `--json` output, encoded as UTF-8 without a BOM, with LF line endings, a stable key order, and one trailing LF.
5. WHEN the verdict is BROKE, THE Result_Object SHALL give the try number, the moves before reduction, the moves after reduction, the reduced move list, and the fingerprint.
6. WHEN the verdict is BROKE, THE plain-text summary SHALL describe the reduced list as "the smallest replay this reducer found".
7. WHEN the verdict is COULDN'T TELL, THE plain-text summary and THE Result_Object SHALL name the cause that stopped the check.
8. WHEN the verdict is HELD, THE plain-text summary SHALL print the exact HELD_Text with the real N, and THE Result_Object SHALL give N.
9. WHEN the verdict is COULDN'T TELL, THE Result_Object SHALL contain the key `reasonTruncated` directly after the key `reason`, with the value `true` when `reason.length >= 200` (the Reason_Cap) and `false` otherwise, computed from the reason as the engine returns it.
10. THE CLI and THE MCP_Server SHALL leave the engine unchanged and SHALL print the reason exactly as the engine returns it, with no further shortening or rewording.

### Requirement 4: Verdict words and exit codes

**User Story:** As a CI author, I want fixed verdict words and exit codes, so that scripts can branch on them.

#### Acceptance Criteria

1. THE CLI SHALL use exactly one of the verdict strings `BROKE`, `HELD`, or `COULDN'T TELL`, with an ASCII apostrophe in `COULDN'T TELL`.
2. WHEN the verdict is HELD, THE CLI SHALL exit with code 0 and print HELD_Text.
3. WHEN the verdict is BROKE, THE CLI SHALL exit with code 1 and print the trace that caused the violation.
4. WHEN the verdict is COULDN'T TELL, THE CLI SHALL exit with code 2 and print the reason.
5. IF an input error or internal error occurs, THEN THE CLI SHALL exit with code 3, print the error message, and print no verdict string.

### Requirement 5: GitHub Action

**User Story:** As a repo owner, I want a CI gate, so that a pull request fails when the gremlins win or the check cannot tell.

#### Acceptance Criteria

1. THE Action SHALL be a composite action named `hexorcist-gate` in `action.yml` at the repo root.
2. THE Action SHALL require the inputs `hex`, `pins`, and `rules`, and SHALL accept the optional inputs `gremlins`, `runs`, and `seed`.
3. WHEN the Action runs, THE Action SHALL run `npm ci` and SHALL run the CLI only if `npm ci` succeeded.
4. WHEN the CLI finishes, THE Action SHALL write a Markdown summary to `$GITHUB_STEP_SUMMARY` that gives the verdict, the exit code, the seed, and the runs.
5. WHEN the CLI exits with code 1, 2, or 3, THE Action SHALL fail the job.
6. WHEN the CLI exits with code 0, THE Action SHALL pass the job.
7. IF a required input is missing or `npm ci` fails, THEN THE Action SHALL not run the CLI, SHALL fail the job, and SHALL state the reason in the summary.
8. THE Action SHALL expose the outputs `verdict` and `exit-code`, and SHALL set both before the step that fails the job, so that a later step in the same job can read them.

### Requirement 6: MCP server

**User Story:** As a user of an MCP client, I want to call the check as a tool, so that an assistant can run it for me.

#### Acceptance Criteria

1. WHEN `npm run mcp` runs, THE MCP_Server SHALL speak JSON-RPC 2.0 over stdio, implemented by hand with no new npm package, and SHALL write only JSON-RPC responses to stdout.
2. WHEN `tools/list` is called, THE MCP_Server SHALL return exactly the tools `check` and `capabilities`, each with a description and an input schema.
3. WHEN `check` is called with the CLI's inputs, THE MCP_Server SHALL return a Result_Object identical to the CLI's.
4. WHEN `capabilities` is called, THE MCP_Server SHALL return the 5 rule sentence forms, the gremlin ids, and the unmodelled peripherals.
5. THE MCP_Server SHALL make no network call.
6. IF a request is malformed, names an unknown method, names an unknown tool, or gives invalid `check` input, THEN THE MCP_Server SHALL return a JSON-RPC error that names the cause and SHALL keep answering later requests.

### Requirement 7: Kiro hooks

**User Story:** As a Kiro user, I want hooks that run the check, so that an agent cannot finish with a broken program unnoticed.

Observed Kiro behaviour (Nov 24, 2026): a Pre Tool Use hook receives JSON on stdin. Marking a spec task done arrives as `tool_name` "task_update" with `tool_input` holding `tasksFilePath`, `taskId`, and `status`. Exit code 2 from a Pre Tool Use hook blocks the tool call, and the agent sees stderr.

#### Acceptance Criteria

1. THE headless runner SHALL create no new hook file and SHALL leave `.kiro/hooks/hexorcist-check-on-stop.json` and `.kiro/hooks/hexorcist-done-guard.json` byte-for-byte unchanged.
2. THE headless runner SHALL implement `cli/hook-stop.ts` and `cli/hook-guard.ts` so that the command line `npx tsx --no-deprecation cli/hook-stop.ts exorcism-demo/loop-check.json --block` (Agent Stop, timeout 300) and the command line `npx tsx --no-deprecation cli/hook-guard.ts exorcism-demo/loop-check.json` (Pre Tool Use, matcher "spec") work as the two existing hook files state them.
3. WHEN the Stop_Hook runs, THE Stop_Hook SHALL read the Loop_Config, run the `build` command given as an array of strings without a shell, and then run the check on the `hex`, `pins`, `rules`, `gremlins`, `runs`, `seed`, and `runMs` values through the Input_Loader and Check_Core.
4. WHEN the Stop_Hook finishes a check, THE Stop_Hook SHALL print exactly one verdict line, which is BROKE with the trace, HELD with HELD_Text, or COULDN'T TELL with the reason.
5. WHEN the Stop_Hook finishes a check, THE Stop_Hook SHALL write the Verdict_Record with the verdict, the exit code, the Hex_Hash, and the fingerprint, and SHALL create the `.hexorcist/` folder when it is missing.
6. IF the build command exits with a non-zero code, the Loop_Config is unreadable or lacks a key, or the HEX file is missing, THEN THE Stop_Hook SHALL print one line that says no check ran and why, SHALL print no verdict string, SHALL record no HELD verdict, and SHALL delete the Verdict_Record when it exists.
7. WHERE the argument `--block` is given and the verdict is BROKE or COULDN'T TELL, THE Stop_Hook SHALL exit with code 2 and write the verdict line to stderr so that the agent keeps working.
8. WHERE the argument `--block` is given and the verdict is HELD, THE Stop_Hook SHALL exit with code 0 and reset the block counter to 0.
9. THE Stop_Hook SHALL keep a counter of blocks in a row in a file under `.hexorcist/`, and SHALL stop blocking, with exit code 0 and a line that says the limit was reached, once the counter has reached the value of `--max-blocks`, which defaults to 3.
10. WHEN the Guard_Hook receives JSON on stdin with `tool_name` "task_update" and `tool_input.status` equal to "completed" or "done", THE Guard_Hook SHALL treat the call as marking a task done.
11. WHEN the Guard_Hook receives any other tool call, any other `status` value, or stdin that is not valid JSON, THE Guard_Hook SHALL allow the call with exit code 0.
12. IF a call that marks a task done arrives and the Verdict_Record is missing, unreadable, or holds a verdict other than HELD, THEN THE Guard_Hook SHALL exit with code 2 and write to stderr the recorded verdict, or that none is recorded, and what the agent has to do next.
13. IF a call that marks a task done arrives and the Hex_Hash of the current HEX file differs from the Hex_Hash in the Verdict_Record or the HEX file is missing, THEN THE Guard_Hook SHALL exit with code 2 and write to stderr that the recorded check is out of date.
14. WHEN a call that marks a task done arrives, the Verdict_Record holds HELD, and the Hex_Hash matches, THE Guard_Hook SHALL allow the call with exit code 0.
15. WHEN the Guard_Hook receives any payload, THE Guard_Hook SHALL write that payload to `.hexorcist/last-pretooluse.json`.
16. THE Guard_Hook SHALL start no emulator, read no clock, and make no network call.
17. THE headless runner SHALL list `.hexorcist/` and `exorcism-demo/build/` in `.gitignore`.

### Requirement 8: Dependencies and packaging

**User Story:** As a maintainer, I want no new dependencies, so that the pinned dependency list stays valid.

#### Acceptance Criteria

1. THE headless runner SHALL leave `dependencies` and `devDependencies` in `package.json` unchanged.
2. THE headless runner SHALL add exactly two scripts to `package.json`: `check` and `mcp`.
3. THE CLI, MCP_Server, and Input_Loader SHALL be written in TypeScript only.
4. THE headless runner SHALL put CLI code in `cli/` and MCP_Server code in `mcp/`.
5. THE CLI and THE MCP_Server SHALL both import exactly one Input_Loader module.
6. THE headless runner SHALL leave the words safe, secure, guaranteed, certified, real-time, first, unique, and shortest out of user-facing text.

### Requirement 9: Acceptance tests

**User Story:** As the project owner, I want fixed acceptance tests, so that the runner is judged against known results.

#### Acceptance Criteria

1. WHEN the CLI checks the crosswalk buggy example, THE CLI SHALL exit 1 with fingerprint `47078989121ebc1d`, try 4 of 24, and moves 8 to 3.
2. WHEN the CLI checks the garage buggy example, THE CLI SHALL exit 1 with fingerprint `616062947f71a1ae`, try 8 of 40, and moves 7 to 3.
3. WHEN the CLI checks the heartbeat buggy example, THE CLI SHALL exit 1 with fingerprint `19827a4e0a7ad440` and moves 2 to 1.
4. WHEN the CLI checks each fixed build, THE CLI SHALL exit 0 and print the exact HELD_Text.
5. WHEN the CLI checks `fixtures/serial_hello` with LED PB5 as output, BUTTON PD2 as input (pressed low), the rule "LED is 1 must never last 500 ms or longer.", and the gremlin masher, THE CLI SHALL exit 2 with a reason that names the serial port.
6. WHEN the CLI runs twice with the same inputs, THE CLI SHALL print identical JSON, and the fingerprint SHALL equal the fingerprint the Page shows.
7. WHEN a scripted MCP stdio session sends `initialize`, `tools/list`, and `tools/call` for `check`, THE MCP_Server SHALL return the same JSON as the CLI.

### Requirement 10: Kiro power

**User Story:** As a Kiro user, I want to install one power, so that my agent can call the check from any project.

Kiro starts power MCP servers with the working folder set to the user's `.kiro` powers folder, not the repo, and `npm` cannot be spawned directly on Windows. No plugin-root variable is relied on, so the repo folder comes from `HEXORCIST_ROOT`, which the user sets once.

Owner-reported (Nov 24, 2026): through the Power, `check` failed on relative paths with `Cannot read the file "exorcism-demo/build/sketch.hex"` while full paths returned HELD, because the Launcher set `INIT_CWD` to its own working folder (the powers folder). Criteria 10.15 to 10.18 replace that rule: the Launcher sets `INIT_CWD` to the repo folder.

#### Acceptance Criteria

1. THE headless runner SHALL provide the Power in the Agent Plugins format, containing `plugin.json`, `mcp.json`, `README.md`, and `skills/check-firmware/SKILL.md`.
2. THE `mcp.json` file SHALL run the Launcher with the command `node` and the arguments `-e` and the inline launcher script, SHALL start no `npm` process, and SHALL contain no separate launcher file reference.
3. THE `mcp.json` file SHALL contain no absolute path and SHALL use no plugin-root variable.
4. WHEN the Launcher starts, THE Launcher SHALL read the repo folder from `process.env.HEXORCIST_ROOT`, and SHALL use the current working directory when `HEXORCIST_ROOT` is not set.
5. WHEN the Launcher has found the repo folder, THE Launcher SHALL start `mcp/bin.ts` with the `tsx` installed in that repo's `node_modules`, with `--no-deprecation`, and SHALL pass stdin, stdout, and stderr through to the child process unchanged.
6. IF the repo folder lacks `mcp/bin.ts` or the repo's `tsx`, or the child process fails to start, THEN THE Launcher SHALL write the cause to a log file in the operating system's temp folder, SHALL write nothing to stdout, and SHALL exit with a non-zero code.
7. THE Launcher SHALL read no clock, call no Math.random, make no network call, and install no package.
8. THE `README.md` file and THE `SKILL.md` file SHALL each document the Result_Object field `reasonTruncated` with exactly this sentence: "true when the reason reached the 200-character limit, so it may have been cut".
9. THE `SKILL.md` file SHALL tell the agent to call `capabilities` before any other tool.
10. THE `SKILL.md` file SHALL tell the agent to write rules only in the five sentence forms that `capabilities` returns.
11. THE `SKILL.md` file SHALL tell the agent to call `check` after it has written the rules.
12. THE `SKILL.md` file SHALL tell the agent to quote HELD_Text word for word and to describe a BROKE reduced list as "the smallest replay this reducer found".
13. THE `README.md` file SHALL state that the user sets `HEXORCIST_ROOT` once, how to set it, and where the Launcher writes its log.
14. THE Power files SHALL leave the Banned_Words out of their text.
15. WHEN the Launcher starts the MCP_Server, THE Launcher SHALL set `INIT_CWD` in the child process environment to the repo folder it found under criterion 10.4 (the `HEXORCIST_ROOT` value, or the current working directory when `HEXORCIST_ROOT` is not set), whether or not `INIT_CWD` was already set in the Launcher's own environment.
16. WHEN the MCP_Server receives a relative file path in `check` input from a Launcher-started process, THE Input_Loader SHALL resolve that path against the repo folder, and THE Input_Loader SHALL resolve an absolute path unchanged.
17. THE `README.md` file and THE `SKILL.md` file SHALL each state that relative paths resolve against the Hexorcist repo folder and that files elsewhere need full paths.
18. WHEN `npm run mcp` or `npm run check` runs, THE headless runner SHALL keep resolving relative paths against the `INIT_CWD` value that npm sets, as in criteria 1.9 and 1.10.

### Requirement 11: Gate demo workflow

**User Story:** As a maintainer, I want a workflow that uses the Action on a known pair of builds, so that the gate is shown to pass and to fail.

#### Acceptance Criteria

1. THE headless runner SHALL provide the Gate_Demo_Workflow, which uses the Action from the repo folder on the Crosswalk example.
2. WHEN the Gate_Demo_Workflow checks the Crosswalk fixed build, THE job SHALL pass.
3. WHEN the Gate_Demo_Workflow checks the Crosswalk buggy build, THE Action step for the buggy build SHALL set `continue-on-error: true` so that the job continues.
4. WHEN the Action step for the buggy build has finished, THE Gate_Demo_Workflow SHALL run a later step that fails the job unless the Action output `verdict` is `BROKE` and the Action output `exit-code` is `1`, so that the workflow run ends green when the buggy build is caught.
5. THE Gate_Demo_Workflow SHALL use no network call other than the ones that `actions/checkout`, setup of Node, and `npm ci` make.

### Requirement 12: Guard script coverage

**User Story:** As a maintainer, I want the guard to scan the new code, so that banned claims, clocks, randomness, and network calls cannot slip in.

#### Acceptance Criteria

1. THE Guard_Script SHALL scan every `.ts`, `.mjs`, `.json`, `.md`, and `.yml` file under `cli/`, `mcp/`, and `power/` in addition to its existing scan targets.
2. IF a scanned file under `cli/`, `mcp/`, or `power/` contains a Banned_Word in user-facing text, THEN THE Guard_Script SHALL report the file, the line, and the word, and SHALL exit with a non-zero code.
3. IF a scanned `.ts` or `.mjs` file under `cli/` or `mcp/` uses `Date.now`, `new Date`, `performance.now`, `setTimeout`, `setInterval`, or `Math.random`, THEN THE Guard_Script SHALL report the file, the line, and the call, and SHALL exit with a non-zero code.
4. IF a scanned `.ts` or `.mjs` file under `cli/` or `mcp/` uses `fetch`, `XMLHttpRequest`, `WebSocket`, or an import of `http`, `https`, `net`, `dgram`, or `dns`, THEN THE Guard_Script SHALL report the file, the line, and the call, and SHALL exit with a non-zero code.
5. WHEN no scanned file contains a finding, THE Guard_Script SHALL report zero findings and exit with code 0.

### Requirement 13: Demo build, demo rules, and loop config

**User Story:** As a Kiro user, I want a ready demo loop, so that the two hooks work on a sketch the moment I open the repo.

#### Acceptance Criteria

1. THE headless runner SHALL provide the Demo_Build_Script, which compiles `exorcism-demo/sketch/sketch.ino` to `exorcism-demo/build/sketch.hex` for the ATmega328P at 16 MHz with the same compiler command that `scripts/build-examples.mjs` uses.
2. WHEN the compile succeeds, THE Demo_Build_Script SHALL print one line and exit with code 0.
3. IF the compile fails, THEN THE Demo_Build_Script SHALL print the compiler output and exit with code 1.
4. THE headless runner SHALL provide `exorcism-demo/crosswalk-full-rules.txt` with exactly these seven lines, LF-terminated:
   - `all of (CAR_GREEN is 1, WALK is 1) must never happen.`
   - `all of (WALK is 1, DONT_WALK is 1) must never happen.`
   - `all of (CAR_GREEN is 1, CAR_YELLOW is 1) must never happen.`
   - `all of (CAR_GREEN is 1, CAR_RED is 1) must never happen.`
   - `all of (CAR_YELLOW is 1, CAR_RED is 1) must never happen.`
   - `CAR_YELLOW is 1 must never last 200 ms or longer.`
   - `WALK is 1 must never last 250 ms or longer.`
5. THE headless runner SHALL provide the Loop_Config with `source` "exorcism-demo/sketch/sketch.ino", `build` ["node","exorcism-demo/build.mjs"], `hex` "exorcism-demo/build/sketch.hex", `pins` "examples/crosswalk/fixture.json", `rules` "exorcism-demo/crosswalk-full-rules.txt", `gremlins` "masher,bouncer", `runs` 24, `seed` 20261101, and `runMs` 1000.
6. THE Input_Loader SHALL accept the Loop_Config `gremlins` value as a comma-separated string, as the `--gremlins` argument does.

### Requirement 14: Platform behaviour

**User Story:** As a Windows user, I want the same commands to work on my machine, so that I see no warnings and no wrong paths.

#### Acceptance Criteria

1. WHEN a CLI, MCP_Server, or hook module decides whether it is the entry point, THE module SHALL compare the script path with the path of the module file case-insensitively after normalising path separators.
2. THE scripts `check` and `mcp` in `package.json` SHALL run tsx with the `--no-deprecation` flag.
3. WHEN `npm run check` or `npm run mcp` runs under a supported Node version, THE process SHALL print no Node deprecation warning on stdout or stderr.
4. WHEN a hook file runs a command through `npx tsx --no-deprecation`, THE command SHALL print no Node deprecation warning.
