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

### Requirement 2: Same engine path as the page

**User Story:** As a teacher, I want the terminal result to match the page, so that I can trust one report across tools.

#### Acceptance Criteria

1. THE CLI SHALL call `runCampaignJob` from `src/ui/app/worker/host.ts` exactly once per check.
2. WHEN `runCampaignJob` returns BROKE, THE CLI SHALL call `runReductionJob` once and then `runReplayJob` once.
3. WHEN `runCampaignJob` returns HELD or COULDN'T TELL, THE CLI SHALL call neither `runReductionJob` nor `runReplayJob`.
4. IF a job returns or throws an error, THEN THE CLI SHALL name the failing job in a message on stderr, print no verdict, and exit with code 3.
5. WHEN the CLI and the Page check the same inputs, THE CLI SHALL produce the same verdict, the same N, and the same event order as the Page.
6. THE MCP_Server SHALL run each check through the same Input_Loader and Check_Core calls as the CLI.
7. THE CLI and THE MCP_Server SHALL read no clock, call no Math.random, and make no network call, and `scripts/guard.mjs` SHALL report zero findings.

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

#### Acceptance Criteria

1. THE Hook_Files SHALL use only the fields found in the existing files under `.kiro/hooks/`: `version`, `hooks`, `name`, `trigger`, `matcher`, `enabled`, and `action` with `type`, `command`, and `timeout`.
2. THE Hook_Files SHALL use shell-command actions only.
3. WHEN the `Stop` hook (shown in the editor as "Agent Stop") fires and the agent changed a program, THE Hook_Files SHALL run the CLI on that program and print one verdict line: BROKE with the trace, or COULDN'T TELL with the reason.
4. IF the `Stop` hook fires with no changed program or the CLI reports an error, THEN THE Hook_Files SHALL print that no check ran and why, with no verdict string.
5. IF the `PreToolUse` hook (shown as "Pre Tool Use") sees a request to mark a task done while the last recorded verdict is BROKE or COULDN'T TELL, or while no verdict is recorded, THEN THE Hook_Files SHALL block the request with exit code 2.
6. WHEN the last recorded verdict is HELD, THE `PreToolUse` hook SHALL allow the request.
7. THE `PreToolUse` hook SHALL run no emulator and make no network call.

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
