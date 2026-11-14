# Implementation Plan: rule-compiler

## Overview

Build the Rule_Compiler under `src/engine/rules/` in five phases, each ending in a checkpoint: (1) Reasons, Window_Cycles, the IR and the Renderer with their example tests and Property 2; (2) the Sentence_Parser and the Rules_File_Reader with Properties 1, 3 and 9 and the Prefix_Oracle; (3) binding, the settled-state machinery, the monitors, the Rule_Checker and `compileRuleSet` with the monitor and compile tests and Property 4 against the Reference_Evaluator; (4) the Trigger_Evaluator with Property 8, the additive `verdict.ts` change with Properties 6 and 7, and the additive `campaign.ts` change with the Campaign_Config_Builder and the wiring tests; (5) the spike wrapper with S1, the spike IR campaign test, Property 5, and the copy and source tests. The final checkpoint adds a measured timing report. Language: TypeScript everywhere (the design uses TypeScript). Tests use vitest 1.6.0 and fast-check 4.10.2, both already pinned in `package.json`; no package is added.

## Rules for every task

- Tasks run one at a time, in order. A task does not start while an earlier task is unfinished or stopped.
- **Never commit.** The agent never commits, never stages and never pushes. `git rev-parse HEAD` and `git for-each-ref` are the same at the end of every task as at its start (Req 17.5).
- **No task writes a baseline file.** This plan needs none: recorded values (fast-check seeds, the spike test's `campaignSeed`) are literals in the new test files. If any task would ever need to create or change a file under `src/engine/__tests__/baselines/`, or a file that a task names as a baseline, it ends at that point, reports the path of each such file, changes no further file and waits for the user to commit (Req 17.4).
- At the start of every task, record `git rev-parse HEAD` and `git ls-files`. Files listed then are committed files. If `git ls-files` cannot run, treat every file under `src/engine/__tests__/` and `fixtures/` as committed and say so in the report (Req 17.1, 17.9).
- Committed files stay byte-for-byte unchanged and are never deleted, renamed or moved: every committed test under `src/engine/__tests__/` (including `spike-monitor.test.ts`, `verdict.property.test.ts`, `copy-rules.test.ts` and every `campaign*.test.ts`), the helpers `arbitraries.ts`, `input-pullup.cases.ts` and `led-level-checker.ts`, everything under `src/engine/__tests__/baselines/`, and everything under `fixtures/`. Helpers may be imported, never edited (Req 17.1).
- Every new test goes in a new `*.test.ts` file under `src/engine/__tests__/` that `git ls-files` did not list when the task started, so `npx vitest --run` collects it. The new helpers `rules-arbitraries.ts`, `rules-reference.ts` and `rules-prefix-oracle.ts` are not test files (Req 17.3).
- Never change, weaken, skip or delete an acceptance test the user wrote into a prompt or this spec. This covers the literal sentences of Req 2.8 to 2.11, the Window_Cycles values of Req 5.5 and 5.7, the spike IR test of Req 14.4, the committed tests, and Properties 1 to 9 and S1. Weakening includes changing an expected value, loosening a comparison, lowering `numRuns` and changing a recorded seed. If such a test fails or disagrees with the system, stop and report the test file and name, the value it expects, the value the system produced, and the evidence (the command, its failing output, and for a property test the seed and the counterexample fast-check printed). Change no file and start no other task until the user decides (Req 17.6).
- A sub-task is reported done only after one `npx vitest --run` over the whole suite with no filter argument and no config change (every committed test passes, except tests the committed file itself marks skip or todo), `npm run typecheck`, `npm run guard` with no finding that names a Rule_Compiler file or `src/engine/campaign.ts`, and `git diff --exit-code HEAD -- src/engine/__tests__/ fixtures/` with no difference (Req 17.1, 17.2, 13.6).
- Debug scripts and scratch files are temporary. Delete every one the task created before reporting it done; `git status --porcelain --untracked-files=all` then lists only the task's deliverables and files already modified or untracked at the start. Never delete a file the agent did not create (Req 17.7).
- Tests are evidence, not proof. Reports name the test files run, the pass, fail and skip counts, and `seed` and `numRuns` for each property test. Reports never use "proof", "proves" or "proven" about test results, except in the phrase "evidence, not proof" and the HELD text "Not a proof." (Req 17.8).
- Property tests: one `fc.assert(fc.property(...), { seed, numRuns })` per property, tag comment `Feature: rule-compiler, Property N: <title>`, and the seed written as a literal in the file when the file is written and never changed afterwards. `numRuns` is the design value: 200 for Properties 1, 2, 3, 6, 7, 8, 9 and S1, 100 for Property 4 (no emulator; at least 100), 20 for Property 5 (emulator; at least 20). Named counters are declared with `let` before `fc.assert`, incremented from the outcome observed in each case (never from what the generator aimed for), and checked after `fc.assert` returns with `expect(counter, message).toBeGreaterThan(0)`, where the message names the outcome never seen and lists every counter's value (Req 16.1).
- A counter of 0 is a test failure: report the counter and the counts, then repair the generator so the outcome occurs by construction. `numRuns`, assertions, counters and the recorded seed are not changed as the fix. If the repaired generator still cannot produce the outcome, stop and report the finding to the user (Req 16.2).
- Determinism (design Overview): simulated time is integer CPU cycles; no `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `Math.random`, `new Date(`, `process.hrtime`, `setImmediate`, `queueMicrotask` or `Date` without `new` in any file under `src/engine/rules/` or in the changed engine files; the Rule_Compiler takes no PRNG and imports nothing from `prng.ts`; the Checker contains no AI and makes no network call (Req 15.1 to 15.4).
- Imports: no file under `src/engine/rules/` imports avr8js, `emulator-bridge.ts`, `prng.ts` or anything outside `src/engine/`. `campaign.ts` and `RunResult` are imported with `import type` only. Runtime imports allowed: `../fixture`, `../copy-rules`, `../gremlins/pins` and modules inside `rules/` (design "Dependency rules").
- Engine source comments do not name the APIs that `scripts/guard.mjs` checks "b" and "b2" scan for; the guard reads comments too. Describe the rule in other words (Req 15.1).
- User-visible text (Renderer output, every Reason, every `CannotCheck` reason, the trigger reason) avoids every word of `BANNED_WORDS` in `src/engine/copy-rules.ts`. The list is not repeated here (Req 15.8).
- Every new fallible function returns `{ ok: true, ... }` or `{ ok: false, ... }`; no success value has a top-level `kind` key (design D10).
- Emulator tests read HEX with `readFileSync` from `fixtures/<name>/build/<name>.ino.hex`, with no fallback. If a HEX file is missing, stop and ask the user. Emulator tests set an explicit timeout through the third argument of `it` (120,000 ms where the design gives it).
- If a save hook runs vitest on files under `src/engine`, do not react to its output and do not change code or tests because of it.

## Tasks

- [ ] 1. Reasons, Window_Cycles, IR and Renderer
  - [ ] 1.1 Implement `src/engine/rules/reason.ts`
    - `cutReason(text)`: cut at 200 UTF-16 code units without leaving half of a surrogate pair (same rule as `truncateReason` in `verdict.ts`)
    - `jsonTypeName(v)`: `a string`, `a boolean`, `null`, `an array`, `an object`, or `the number <String(v)>`; copies no string value
    - JSON path text built only from the field names listed in Req 1.1 to 1.5 and zero-based array indexes (`rules[2].trigger.of.value`); the Rule root is `the rule`
    - _Requirements: 1.8, 1.9, 1.17, 2.7, 15.5, 15.9_

  - [ ] 1.2 Implement `src/engine/rules/duration.ts`
    - `durationDigits`, `isDurationMs`, `formatDuration`, `clockRate`, `windowCycles`, `cycleLimit` with the signatures of the design section "Window_Cycles arithmetic"
    - Method D1, decimal-digit BigInt scaling: Number-to-String digits with the exponent expanded, M and k, `N = M × BigInt(clock)`, `Q = 1000n × 10n ** BigInt(k)`, remainder check gives `window not a whole number of cycles`; the clock check (`typeof clock === "number"`, integer, above 0) runs before it and gives `clock rate is not a whole number of hertz`
    - `clockRate(fixture)` returns `fixture.clockHz` when neither `undefined` nor `null`, else `DEFAULT_CLOCK_HZ` from `../gremlins/pins`; the raw value is returned unchecked
    - `cycleLimit(cycles)` is `Number(cycles)` up to 2^53 − 1 and `Infinity` above
    - _Requirements: 1.6, 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

  - [ ] 1.3 Implement the IR types and validation in `src/engine/rules/ir.ts`
    - `Condition`, `Edge`, `Rule`, `RuleForm`, `RuleSet`, `IrDocument`, `ReadResult`, `WriteResult`, and the constants `IR_VERSION`, `MAX_RULES`, `MAX_NESTING_DEPTH`, `MIN_MEMBERS`, `MAX_MEMBERS`, `MAX_COUNT`, exactly as in the design section "IR"
    - `isSignalName` (pattern `^[A-Za-z][A-Za-z0-9_]{0,31}$`, not `all` or `any`, not a `BANNED_WORDS` entry ignoring case, list imported from `../copy-rules`)
    - `validateRule` (paths from the Rule root) and `validateRuleSet` (paths from the document root): document-order walk, at most one Reason per offending value, one `has a field that is not allowed.` Reason per holding object with the field name never written, integer fields by `Number.isInteger(v) && !Object.is(v, -0)`, Duration_Ms fields by `isDurationMs` on the parsed number, unknown `form` or `op` reported once and not checked further, depth above 4, 2 to 8 members, 1 to 32 Rules, own-property tests with `Object.prototype.hasOwnProperty.call` (a `__proto__` key is a field that is not allowed). Reason wording from the design "Error Handling" table, cut with `cutReason`
    - The repeated-sentence check is added in 1.5, after the Renderer exists
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.17, 15.5_

  - [ ] 1.4 Implement `src/engine/rules/render.ts`
    - `render(rule: unknown): RenderResult`; calls `validateRule` and returns `{ ok: false, reason: "Not a valid rule: " + reasons[0] }` cut to 200 on any Reason, else fills the templates of the design table
    - Integers with `String(n)`; Duration_Ms with `formatDuration`; `time` for k 1, `times` otherwise; reads fields by name so key order and earlier calls do not matter; never writes to its argument; never throws for any JavaScript value
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 15.5, 15.7_

  - [ ] 1.5 Implement `readIr` and `writeIr` in `src/engine/rules/ir.ts`
    - `readIr(text)`: the five steps of the design in the order of Req 1.14 (not valid JSON; `version` missing or wrong with `jsonTypeName`; structure by `validateRuleSet`; repeated sentences as `rules <i>, <j>, ... repeat the sentence "<sentence>"` with indexes ascending and the sentence cut so the Reason fits 200; otherwise a fresh copy holding only listed fields in IR order). Only the Reasons of the earliest failing step are returned. Never throws
    - `writeIr(ruleSet)`: `validateRuleSet` plus the repeated-sentence check, earliest Reason as `{ ok: false, reason }`; otherwise rebuild with the key order table of the design and write `JSON.stringify(doc, null, 2) + "\n"`. Never throws
    - The repeated-sentence check is exported from `ir.ts` for reuse by `compileRuleSet` (task 4.5)
    - _Requirements: 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17, 15.7_

  - [ ] 1.6 Write `src/engine/__tests__/rules-duration.test.ts`
    - At 16,000,000 Hz: 300 gives `4_800_000n`, 0.1 gives `1_600n`, 0.0000625 gives `1n` (Req 5.5 values, acceptance literals); 0.0001, 0.0000001 and 9,999,999.9999999 give `window not a whole number of cycles`; 9,999,999 gives `159_999_984_000n` (Req 5.7 values, acceptance literals)
    - A result above 2^53 − 1 with a large integer clock is exact as a BigInt, and `cycleLimit` of it is `Infinity`
    - `clockRate` with `clockHz` undefined and null gives 16,000,000; `windowCycles` with clock 0, −1, 16,000,000.5, `NaN`, `Infinity` and a string gives `clock rate is not a whole number of hertz` and only that one reason (Req 5.4, 5.8)
    - `isDurationMs`: 300, `300.0`, `3e2`, 0.0000625, 0.0000001 accepted; 0.00000001, 10000000, 0.30000000000000004, 0, negative, `NaN`, `Infinity` rejected. `formatDuration`: 300 to `300`, 0.1 to `0.1`, 5e-7 to `0.0000005`, 2.5 to `2.5`
    - _Requirements: 1.6, 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 16.12_

  - [ ] 1.7 Write the Renderer examples in `src/engine/__tests__/rules-templates.test.ts`
    - The sentences of Req 2.8, 2.9, 2.10 (both) and 2.11 (both), copied literally; these are acceptance tests
    - One example per Rule_Form template; `time` and `times` for k 0, 1 and 2; Duration formats 300, 0.1, 0.0000005 and 2.5; `ms` after a Duration of 1
    - Invalid values give `{ ok: false }` with a Reason of 1 to 200 characters naming the path from the Rule root: `null`, `undefined`, an array, a missing field, an extra field (whose name is a marker string that must not appear in the Reason), a string value marker that must not appear, Duration_Ms 0, negative, `NaN`, `Infinity` and 0.30000000000000004, a Condition at depth 5
    - Parser examples are added to this file in task 2.3
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10, 2.11, 16.12_

  - [ ] 1.8 Write `src/engine/__tests__/rules-ir.test.ts`
    - Integer fields: `1.0` and `1e0` read as 1; `-0` and `-0.0` rejected with their JSON path
    - The Duration examples of Req 1.6 read through `readIr`
    - One `version` example per JSON type (number with its Number-to-String text, string, boolean, null, array, object) and `version` missing; each gives exactly one Reason and copies no string value
    - Invalid JSON gives exactly `The text is not valid JSON.`; a top-level non-object; nested paths such as `rules[2].trigger.of.value`; unlisted fields at several depths give one Reason per holding object, with marker field names and marker string values that must not appear in any Reason
    - Repeated sentences name the indexes and the sentence; a long repeated sentence is cut with the indexes kept
    - Check order of Req 1.14 (a document with both a structure fault and a repeated sentence returns only the structure Reasons); `readIr` returns Rules in array order
    - `writeIr` on invalid values gives a Reason and does not throw; `writeIr` output key order; same text on two calls
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.14, 1.15, 1.16, 1.17_

  - [ ] 1.9 Create `src/engine/__tests__/rules-arbitraries.ts` with `arbRule` (helper, not a test file)
    - `arbRule` exactly as the design Property 1 generator: `fc.letrec` Conditions with the depth budget passed down and a forced deep branch in a quarter of cases so depth 4 appears; `all`/`any` with 2 to 8 members; `eq` 0 or 1; `above` 0 to 1022; `below` 1 to 1023; `max` 0 to 65,535 with extra weight on 0, 1 and 2; Duration_Ms from an integer part 0 to 9,999,999 and 0 to 7 fraction digits (last digit non-zero, value above 0) converted with `Number(text)`; signal names from the Signal_Name pattern filtered by test code equivalent to `isSignalName`, with extra weight on the template words of Req 3.8
    - `arbRuleSet`: 1 to 32 Rules with distinct Canonical_Sentences (selector `render(r).sentence`), half the cases at length 1
    - Imports types, `render`, `BANNED_WORDS` and, if useful, the committed `arbitraries.ts` (never edited)
    - _Requirements: 16.3, 16.4_

  - [ ] 1.10 Write property test for the IR round trip in `src/engine/__tests__/rules-ir.property.test.ts`
    - **Property 2: IR round trip**
    - `readIr(writeIr(set).text)` gives `{ ok: true, ruleSet }` deep-equal to the generated set; `writeIr` twice gives the same text
    - Generator `arbRuleSet`. Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `never`, `respond`, `count`, `hold`, `notLongerThan`, `setOfOne`, `setOfMany`
    - **Validates: Requirements 1.13, 1.12, 1.15**

- [ ] 2. Sentence_Parser and Rules_File_Reader
  - [ ] 2.1 Implement `src/engine/rules/parse.ts`
    - `parse(sentence)` and `allowedAt(prefix)` with the types `AllowedItem` and `ParseResult` of the design
    - Live-state matcher of D2 over the fixed grammar: each state can still be completed into a Canonical_Sentence of a valid Rule (signal rules, integer ranges, `time`/`times`, Duration digits, list member counts, depth budget 4); P is the number of characters read while a state is live; allowed set is the union of the next printable ASCII characters plus the end of the text when a state is complete
    - D3: a Rule is returned only when `render(rule).sentence === input`; otherwise a Reason at position `input.length`
    - No case folding, trimming or normalization. Reason text `No rule template matches at position <P> (counting from 0); allowed there: <items>.` with items merged into code-point ranges, end of the text last, at most 6 items, `a space` for U+0020; the `allowed` field holds exactly the named items; no input text copied; 1 to 200 characters. Never throws
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 15.7, 15.9_

  - [ ] 2.2 Implement `src/engine/rules/rules-file.ts`
    - `MAX_RULES_FILE_UNITS = 65_536` and `readRulesFile(text): ReadResult` with the six steps of the design in order: drop one leading U+FEFF; length check (`The text is longer than 65536 UTF-16 code units.`); `{` as the leading non-whitespace character passes the whole remaining text to `readIr` unchanged; else split at LF, remove one trailing CR, skip blank and `#`-at-index-0 lines, parse every other line exactly as written; `Line <n>: <parser reason>` per failing line with the line number kept when cut; `Found <n> rules; a rules file needs 1 to 32.` and `Lines <a>, <b>, ... repeat the sentence "<sentence>"` returned together when both apply
    - No file input or output. Never throws
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 15.7_

  - [ ] 2.3 Add the parser examples to `src/engine/__tests__/rules-templates.test.ts` (new file from task 1.7)
    - Rejected with a Reason and no Rule: each number form of Req 3.7 (`0300`, `+5`, `-1`, `3e2`, `300.0`, `.5`, `5.`, `4,800`, `4_800`); `1 times` and `2 time`; a tab, CR, LF, non-breaking space, curly quote and non-ASCII digit; the empty string; out-of-range `eq`, `above`, `below`, count and Duration values; a 33-character signal; `all` and `any` as signals; a `BANNED_WORDS` entry as a signal in several letter cases (list read from the constant); 1 and 9 members; depth 5
    - Accepted: template words as signal names (`is`, `above`, `below`, `of`, `becomes`, `true`, `false`, `must`, `never`, `last`, `or`, `longer`, `Within`, `After`); no Fixture is consulted
    - For several rejections: the Reason text names the same P and items as the `position` and `allowed` fields, P equals the input length for a truncated sentence, and a marker substring of the input never appears in the Reason
    - _Requirements: 3.2, 3.3, 3.4, 3.7, 3.8, 3.9_

  - [ ] 2.4 Write `src/engine/__tests__/rules-file.test.ts`
    - `{` after leading spaces, tabs, CR and LF goes to `readIr` with the same result; comments and blank lines skipped; `#` after a space is parsed (and fails); CR removed at line end; two failing lines in ascending order with one-based numbers counted over skipped lines; a long parser Reason cut with the line number kept
    - 0 Rules (empty and whitespace-only text) and 33 Rules give the count Reason; repeated sentences with line numbers; count and repeat Reasons together
    - One leading U+FEFF removed and its line is line 1; a second U+FEFF kept (and the line fails); 65,536 and 65,537 units with and without a leading U+FEFF
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 16.12_

  - [ ] 2.5 Write property test for the sentence round trip in `src/engine/__tests__/rules-sentence.property.test.ts`
    - **Property 1: Sentence round trip**
    - `parse(render(r).sentence)` gives `{ ok: true, rule }` deep-equal to r. In the same case: the sentence is printable ASCII with single spaces, one final period and no other period outside Duration_Ms values; `render` of a copy with every object's keys reversed gives the same sentence; r is deep-equal to a clone taken before the calls; `render` and `parse` twice give deep-equal results; `JSON.parse(JSON.stringify(rule))` deep-equals `rule`
    - Generator `arbRule`. Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `never`, `respond`, `count`, `hold`, `notLongerThan`, `eq`, `above`, `below`, `all`, `any`, `maxIsOne`, `maxNotOne`, `durationWhole`, `durationFraction`
    - Placed here and not in phase 1 because it calls `parse`, which task 2.1 builds
    - **Validates: Requirements 3.5, 3.1, 2.5, 2.6, 15.5, 15.7**

  - [ ] 2.6 Write property test for no silent change in `src/engine/__tests__/rules-sentence.property.test.ts`
    - **Property 3: No silent change**
    - Add `arbMutatedSentence` to `rules-arbitraries.ts`: one or more inserts, deletes, replaces, case changes, whitespace changes (tab, CR, LF, NBSP, doubled space, leading or trailing space) and number changes (leading zero, sign, exponent, `.0`, `,` and `_` separators, out-of-range values, and moves to another valid value)
    - Second `it` in the file: for s from `fc.oneof(arbMutatedSentence, fc.string({ unit: "binary", maxLength: 300 }))`, `parse(s)` does not throw and returns either `{ ok: false }` with a `reason` of 1 to 200 characters and no `rule`, or `{ ok: true, rule }` with `render(rule).sentence === s`
    - Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `rejected`, `accepted` (a Rule returned for a mutated s that differs from its source sentence)
    - **Validates: Requirements 3.2, 3.6, 3.3, 3.7**

  - [ ] 2.7 Create the Prefix_Oracle in `src/engine/__tests__/rules-prefix-oracle.ts` (helper, not a test file)
    - Written from Req 1 and 2 only; imports only `render` and `BANNED_WORDS`, never `parse.ts`
    - Tokenizes the prefix at spaces, matches complete tokens against the five templates with a small backtracking matcher, and checks whether some valid token starts with the last partial token (signal, integer in range, count, duration, keyword, punctuation)
    - When it answers viable, it builds a witness Rule by filling every remaining hole with a fixed valid value, so the test can check `render(witness).sentence.startsWith(prefix)`, and equality when the end of the text is allowed
    - _Requirements: 3.4, 3.9, 16.11_

  - [ ] 2.8 Write property test for the rejection position in `src/engine/__tests__/rules-prefix.property.test.ts`
    - **Property 9: Rejection position**
    - Generator: `arbRule`, then `fc.nat()` reduced modulo the valid index range, then the change kind (insert of a printable ASCII character at 0 ≤ i ≤ length, delete, or replace with a different printable ASCII character at 0 ≤ i < length) and the character
    - On a Reason: `position` P ≥ i; every character of every named range is allowed at P of s by the Prefix_Oracle, with its witness checked by `startsWith`; a named end of the text is allowed at P by the Prefix_Oracle; the Reason text names the same P and items as the data fields. On a Rule: `render` of it equals s
    - Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `rejected`, `accepted`
    - **Validates: Requirements 3.4, 3.9**

- [ ] 3. Checkpoint - IR, Renderer, Sentence_Parser and Rules_File_Reader
  - Run `npm run typecheck`, `npm run guard` and the full `npx vitest --run` with no filter. Report `git diff --exit-code HEAD -- src/engine/__tests__/ fixtures/` (expected: no difference) and `git status --short`.
  - Ensure all tests pass. If a committed test or a user-dictated acceptance test fails, stop and report the expectation, the actual value and the evidence, and wait for the user (Req 17.6). Ask the user if questions arise.

- [ ] 4. Binding, settled state, monitors, Rule_Checker and compile
  - [ ] 4.1 Implement `src/engine/rules/bind.ts`
    - `SignalKind`, `RulePlan`, `RuleSetPlan`, `analyzeRuleSet(ruleSet, fixture)` and `analyzeRule(rule, fixture)` as in the design section "Signal binding and compile-time marks"
    - Per Rule in Rule_Set order: `signals` in Canonical_Sentence order (Edge before `expect`), once each; pin count per signal by exact case-sensitive comparison giving `signal <S> is not mapped to a pin`, `signal <S> is mapped to more than one pin` (no kind check then), `<S> is an analog input; use above or below`, `<S> is not an analog input`; then the Req 5 mark from `windowCycles(ms, clockRate(fixture))` as the last mark; no Req 5 mark for `never`; `limit = cycleLimit(windowCycles)`
    - `checkerSignals` concatenated across Rules at earliest appearance, marked Rules included; `kinds` only for signals mapped to exactly one pin (`inactiveLevel` 1 for `activeLevel` `"low"` or absent, 0 for `"high"`; `restLevel ?? DEFAULT_REST_LEVEL`); `digitalInputSignals` from every Fixture Digital_Input
    - _Requirements: 5.3, 5.4, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 4.2 Implement `src/engine/rules/trace.ts`
    - `SignalValue`, `Change`, `SignalTable`, `CompiledCondition`, `makeSignalTable`, `compileCondition`, `evalCondition`, `initialState`, `toChanges` as in the design section "Settled-state machinery"
    - Initial_State per the design table "What the monitor sees": earliest cycle-0 `OutputEvent` per referenced output, `"input"` when absent; Inactive_Level then Rest_Events (`gremlinId === "rest"`) for Digital_Inputs; `restLevel ?? 512` for Analog_Inputs; `restState` never read
    - `toChanges` leaves out snapshot entries and Rest_Events, uses `appliedCycle` for inputs, maps `"release"` to the Inactive_Level, and numbers changes with a growing `seq`; `evalCondition` treats `"input"` as making both `eq` values false, `above` as `>` and `below` as `<`, and evaluates every `all`/`any` member on the same values
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 8.1, 8.2, 8.3, 8.4, 8.7, 8.8, 8.9_

  - [ ] 4.3 Implement `src/engine/rules/monitors.ts`
    - `Monitor` and `makeMonitor(plan, table, initialTruth)` with the `before`, `at` and `flush` behaviour of the design table for `never`, `respond`, `count`, `hold` and `notLongerThan`
    - Occurrences from the previous change-point truth value (Initial_State before cycle 0), at most one per cycle; `found(v)` stops the monitor and sets `dead` when `v >= cutoff`
    - Work per change point only, never per cycle (D4); comparisons with `limit`, which may be `Infinity` (D1)
    - _Requirements: 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 11.6_

  - [ ] 4.4 Implement `src/engine/rules/rule-checker.ts`
    - `makeRuleChecker(plan: RuleSetPlan): Checker` with state held in the closure of one call, following the eight steps of the design section "Rule_Checker"
    - Call-order and cycle-range checks throw `Error("rule checker: ...")` naming the mismatch (D7); fresh per-Run state at every `stepIndex` 0 call, with every compile-time mark returned only there, in Rule_Set order
    - Floating_Diagnostics read before changes are settled: per-signal cut-off d for Rules that reference the signal, and once per Run one entry per Active_Rule with `input <S> was read while floating` or `an input was read while floating`; other diagnostics ignored
    - Frontier K (D5): `newK` is `cycle − 1`, or `cycle` at end of run; cycle 0 is always a change point; a change for a cycle at or below K throws; changes above K wait
    - Choose the lowest (cycle, Rule_Set index) Violation not yet reported; at end of run add `run shorter than the rule window` for each timed Active_Rule with `limit > cycle`, except the Rule whose Violation that call returns; `cannotCheck` omitted when empty, entries in the order compile-time marks, floating entries, run-shorter entries
    - _Requirements: 5.6, 6.7, 6.8, 6.10, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 15.6_

  - [ ] 4.5 Implement `compileRuleSet` in `src/engine/rules/compile.ts`
    - `CompiledRuleSet` with `checker` and `checkerSignals`, and `CompileResult`. Task 6.2 adds the third field, `findUntriggeredRules`, once the Trigger_Evaluator exists
    - Steps: `validateRuleSet` plus the repeated-sentence check from task 1.5, Reasons prefixed `Rule set: `; `validateFixture` inside `try`, an error giving the one Reason `Fixture: rejected with kind <kind>.` with no `message` or `signal` text; then `analyzeRuleSet` and `makeRuleChecker` over a private deep copy of the Rule_Set and Fixture taken at compile time. Never throws
    - _Requirements: 6.1, 6.9, 6.11, 13.7, 15.3, 15.6_

  - [ ] 4.6 Write `src/engine/__tests__/rules-compile.test.ts`
    - `checkerSignals` order across and within Rules (Edge signals before `expect`, earliest appearance, marked Rules included)
    - Each compile-time reason of Req 6.2 to 6.5 and Req 5.3 and 5.4 returned at the `stepIndex` 0 call in the order of Req 6.7 and never at `stepIndex` above 0; mapped-twice replaces the kind checks; a `never` Rule gets no Req 5 mark; at most one Req 5 entry per Rule; `eq` on a digital pin adds no mark
    - An all-marked Rule_Set compiles without throwing and returns `violation: null` at every call; a Rule_Set with marked and Active Rules returns the same `violation` at every call as a compile of only the Active_Rules
    - Rejections: invalid Rule_Set Reasons with JSON paths and the `Rule set: ` prefix; a Fixture rejected by `validateFixture` (including `clockHz: null`, decision OQ1) gives `Fixture: rejected with kind invalid-fixture.` with no message or signal text; a non-object Fixture does not throw
    - Two compiles of the same input give the same `checkerSignals`; changing the caller's Rule_Set or Fixture after compile does not change the checker's outcomes
    - _Requirements: 5.6, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 13.7, 15.6, 16.12_

  - [ ] 4.7 Write `src/engine/__tests__/rules-monitor.test.ts`
    - Boundary examples per form: `notLongerThan` span of L (Violation at s + L) and L − 1 (none), and a fall at exactly s + L still a Violation; `respond` met at t + W and at t; `count` with k = 0 fails at the earliest Occurrence; `hold` false at t gives a Violation at t, and a later Occurrence does not shorten an earlier range; `never` true in Settled_State(0)
    - Initial_State: missing snapshot gives `"input"`; Digital_Input Inactive_Level for each `activeLevel`; Rest_Event sets the value and `restState` is ignored; the firmware-read level is not modelled; `above`/`below` at value 512 with n 511, 512 and 513; `"input"` makes both `eq` values false
    - Incremental contract: a Violation at cycle X waits for the next call; end of run with X above Run_Cycles reports `respond` at t + W = X and `notLongerThan` at s + L = X; open windows give nothing; ties broken by Rule_Set order; each call-order break of Req 10.11 and an out-of-range `cycle` throws a `rule checker: ...` Error; reset after a Run cut at a Violation
    - Run-level reasons: run-shorter entries, and none for the Rule whose Violation the end-of-run call returns; the floating entry for every Active_Rule once per Run, with the fallback text for a signal that is not a valid Signal_Name; a non-Fixture `floating-input` diagnostic leaves every outcome unchanged; the cut-off d removes Violations at or above d for referencing Rules only
    - _Requirements: 7.2, 7.4, 7.5, 7.10, 8.3, 8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.11, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 16.12_

  - [ ] 4.8 Create the Reference_Evaluator and `arbCheckerCase`
    - `src/engine/__tests__/rules-reference.ts` (helper, not a test file): imports types and `render` only, nothing from `rules/bind.ts`, `rules/trace.ts`, `rules/monitors.ts`, `rules/rule-checker.ts` or `rules/trigger.ts`. Reads the whole trace at once, decides Active_Rules by its own pin lookup, builds Initial_State from Req 7 text, stores `state[c]` for every cycle 0 to E, computes truth arrays and Occurrences, and evaluates each form by direct loops over cycles; models Req 11.2, 11.3 and 11.6; returns the Run's lowest (cycle, Rule_Set index) Violation, the per-Rule results after the cut-off, and the floating entries
    - `arbCheckerCase` in `rules-arbitraries.ts`, exactly the four generator steps of the design Property 4: Fixture of 1 to 5 pins from the pool `LED`, `OUT2`, `BTN`, `BEAM`, `POT`, `KNOB` (one case in ten with a doubled signal, one in ten with a wrong-kind signal); 1 to 4 Rules with W from 1 to 20,000 and Duration_Ms = W / 16,000; trace with E from 1 to 20,000, snapshot, output changes, Rest_Events, shared-cycle and same-signal inputs, and the four kinds of floating diagnostics; strictly ascending Step boundaries mixing random cycles and `appliedCycle` values, with the one-Step split `[E]` forced in a fifth of cases, and observations shaped as `runOne` builds them
    - _Requirements: 16.6_

  - [ ] 4.9 Write property test for the differential check in `src/engine/__tests__/rules-checker.property.test.ts`
    - **Property 4: Differential check against the Reference_Evaluator**
    - Drive the compiled Rule_Checker over the generated stream and stop at the call that returns a Violation, as `runOne` does. Assert agreement with the Reference_Evaluator on Violation or none, `Violation.cycle` and `Violation.rule`, and for a Run with no Violation on the floating-input `CannotCheck` list (de-duplicated by `(rule, reason)` in order of appearance); every outcome passes the `callChecker` checks of fact F7; every `CannotCheck` reason has 1 to 200 characters and a Canonical_Sentence as `rule`; a second compiled checker fed the same stream with interleaved calls returns deep-equal outcomes
    - Generator `arbCheckerCase`. Seed: one literal recorded in the file, never changed. numRuns 100 (no emulator; the Reference_Evaluator replays every cycle)
    - Counters asserted > 0 after `fc.assert`, counted from the Reference_Evaluator's per-Rule result after the cut-off: `neverViolating`, `neverClean`, `respondViolating`, `respondClean`, `countViolating`, `countClean`, `holdViolating`, `holdClean`, `notLongerThanViolating`, `notLongerThanClean`, `floatingEntry`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 11.2, 11.3, 11.4, 11.5, 11.6, 5.6, 6.8, 15.6**

- [ ] 5. Checkpoint - Rule_Checker
  - Run `npm run typecheck`, `npm run guard` and the full `npx vitest --run` with no filter. Report `git diff --exit-code HEAD -- src/engine/__tests__/ fixtures/` (expected: no difference) and `git status --short`.
  - Ensure all tests pass. If a committed test or a user-dictated acceptance test fails, stop and report the expectation, the actual value and the evidence, and wait for the user (Req 17.6). Ask the user if questions arise.

- [ ] 6. Trigger check, verdict extension, Campaign wiring and Campaign_Config_Builder
  - [ ] 6.1 Implement `src/engine/rules/trigger.ts`
    - `TriggerRun`, `triggerOccurred(rule, fixture, run)` and `untriggeredRules(ruleSet, fixture, runs)` as in the design section "Trigger_Evaluator and Untriggered_Rule function"
    - `triggerOccurred`: `analyzeRule`; false for a non-Active Rule, a `never` Rule, an invalid Rule or a Fixture that `validateFixture` rejects; `initialState` and `toChanges` from `trace.ts` over the whole `outputEvents` and `appliedInputs`; change points 0 to `endCycle`; `diagnostics` ignored; the window-fit table of the design per form. Pure, never throws, leaves its arguments unchanged
    - `untriggeredRules`: sentences in Rule_Set order, once each, Active_Rules other than `never` whose Trigger occurred in no Run (all of them for an empty list)
    - _Requirements: 12.1, 12.2, 12.3, 12.7, 15.7_

  - [ ] 6.2 Add `findUntriggeredRules` to `compileRuleSet` in `src/engine/rules/compile.ts`
    - `CompiledRuleSet` gains `findUntriggeredRules: (runs: readonly RunResult[]) => string[]`, bound as `(runs) => untriggeredRules(ruleSet, fixture, runs)` over the private deep copies taken at compile time; `RunResult` imported with `import type`
    - The existing `rules-compile.test.ts` cases keep passing
    - _Requirements: 12.3, 13.1_

  - [ ] 6.3 Add the Reference_Evaluator's trigger check and the trigger generator
    - In `rules-reference.ts`: a trigger check written from Req 12.1 by direct loops over cycles, independent of `trigger.ts` and `trace.ts`
    - In `rules-arbitraries.ts`: synthetic `RunResult` generators with `endCycle` 1 to 20,000 (Property 8) and 1 to 5,000 (Property 7), Rules of forms `respond`, `count`, `hold`, `notLongerThan` (plus `never` for Property 7) over a fixed test Fixture, Occurrences placed near `endCycle − W` so window-cut cases appear, and per Rule some Runs with a fitting Trigger, some with an Occurrence whose window does not fit, and some with none; `violation` set on some Runs
    - _Requirements: 16.9, 16.10_

  - [ ] 6.4 Write property test for the Trigger_Evaluator in `src/engine/__tests__/rules-trigger.property.test.ts`
    - **Property 8: Trigger_Evaluator against the reference**
    - `triggerOccurred(rule, fixture, run)` equals the Reference_Evaluator's trigger check; called twice it returns the same value; `run` is deep-equal to a clone taken before the call
    - W from 1 to 20,000. Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `occurred`, `notOccurred`, `windowCut`
    - **Validates: Requirements 12.1, 12.2, 15.7**

  - [ ] 6.5 Extend `src/engine/verdict.ts` (additive)
    - `VerdictInput` gains `untriggeredRules?: readonly string[]` (D8); export `runCountPhrase(n)` and `triggerReason(n)` exactly as in the design
    - `computeVerdict`: `finished` false still returns `null` before anything else; BROKE branch appends `{ rule: s, reason: triggerReason(N) }` per sentence in field order after the existing loop, skipping keys already in `seen`, with `trace` built as today; COULDN'T TELL branch pushes `Rule "${s}" could not be checked: ${triggerReason(N)}` once per distinct s after the Run `CannotCheck` parts and before the unmapped-signal part; N is `runs.length`; `buildReason` and `truncateReason` unchanged; no new verdict string; no new import
    - An absent or empty field leaves every branch exactly as today
    - Committed tests that must pass unchanged: `src/engine/__tests__/verdict.property.test.ts`, `copy-rules.test.ts`, `campaign.test.ts`, `campaign.handle.test.ts`, `campaign.overshoot.test.ts`, `campaign.property.test.ts` and `spike-monitor.test.ts`. If one fails, stop and report per Req 17.6
    - _Requirements: 12.4, 12.5, 12.6, 12.8, 12.9, 12.10, 12.11_

  - [ ] 6.6 Write `src/engine/__tests__/rules-verdict.test.ts`
    - `trigger never happened in 1 run` and `trigger never happened in 2 runs` in both the COULDN'T TELL reason and the BROKE `unchecked` list, with N taken from `runs.length` and not `requestedRuns`; `0 runs` for an empty `runs` list
    - Part order: Run `CannotCheck` parts, then trigger parts, then unmapped-signal, unsupported-peripheral, short-run and no-gremlin-event parts; the 200-unit cut
    - De-duplication of repeated sentences in the field and of an `unchecked` entry already present; BROKE `trace` deep-equal to the one without the field
    - `finished` false gives `null` whatever the field holds; absent and empty field give a value deep-equal to today's for the same input
    - _Requirements: 12.5, 12.6, 12.9, 12.10, 12.11, 16.12_

  - [ ] 6.7 Write property test for verdict honesty in `src/engine/__tests__/rules-verdict.property.test.ts`
    - **Property 6: Verdict honesty**
    - With `finished` true, 0 to 8 completed Runs and `requestedRuns` 1 to 8: BROKE only when some Run has a non-null `violation`, with the trace of the lowest violating Run_Index; HELD only when n ≥ 1 and n equals `requestedRuns`, with `text` equal to `heldText(n)` and `runs` equal to n; an empty `untriggeredRules` gives a value deep-equal to the one without the field
    - Generator from the design (synthetic `RunResult`s, `cannotCheck` from a small pool, `eventList` with and without non-rest events, `unmappedSignals` and `unsupportedPeripherals` empty in half the cases, `untriggeredRules` from `fc.option(fc.array(sentencePool, { maxLength: 4 }))` with an explicit empty-array branch). Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `broke`, `held`, `couldntTell`
    - **Validates: Requirements 12.4, 12.5, 12.6, 12.8, 12.9**

  - [ ] 6.8 Write property test for the trigger check through the verdict in `src/engine/__tests__/rules-verdict.property.test.ts`
    - **Property 7: Trigger check through the verdict**
    - Second `it` in the file. Rules of Active_Rules over the fixed test Fixture and 1 to 8 synthetic `RunResult`s, passed through `untriggeredRules` then `computeVerdict` (with `requestedRuns` equal to the list length or larger); each Rule's Trigger per Run decided by the Reference_Evaluator's trigger check. (a) A Rule seen in no Run: Verdict not HELD; COULDN'T TELL when no Run has a Violation; BROKE with `unchecked` containing `{ rule: <sentence>, reason: "trigger never happened in <R>" }` otherwise, R the Run_Count_Phrase for the list length. (b) A Rule seen in at least one Run: no trigger text for it in the COULDN'T TELL `reason` or any `unchecked` entry. `never` Rules never appear in the list
    - W from 1 to 2,000. Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `neverSeenClean`, `neverSeenBroke`, `seenInAll`, `seenInSome`, `oneRun`, `manyRuns`
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.5, 12.6, 12.7, 12.10, 11.5**

  - [ ] 6.9 Extend `src/engine/campaign.ts` (additive)
    - `CampaignConfig` gains `findUntriggeredRules?: (runs: readonly RunResult[]) => readonly string[]` (D8); no other type gains a field; no new import
    - Inside `makeHandle` only, per the design pseudocode: a per-handle memo, `resolveUntriggered()` called once when the handle becomes finished with `structuredClone(runs)` (resumed Runs included), a throw giving `internal("untriggered-rule function failed: it threw")` and a non-array-of-strings return giving `internal("untriggered-rule function failed: it returned a value that is not an array of strings")`, kept in `failure` so later `runSlice` calls return the same `internal-error` and `state()` still returns every completed Run (D9); `computeVerdict` receives `untriggeredRules` only when the field is set, so with the field absent it receives the same object as today
    - Committed tests that must pass unchanged: `src/engine/__tests__/verdict.property.test.ts`, `copy-rules.test.ts`, `campaign.test.ts`, `campaign.handle.test.ts`, `campaign.overshoot.test.ts`, `campaign.property.test.ts` and `spike-monitor.test.ts`. If one fails, stop and report per Req 17.6
    - _Requirements: 13.2, 13.3, 13.5, 13.8, 13.9_

  - [ ] 6.10 Implement `src/engine/rules/config-builder.ts`
    - `CampaignConfigRest`, `BuildResult` and `buildCampaignConfig(ruleSet, fixture, rest)`: on success `{ ...rest, fixture, checker, checkerSignals, findUntriggeredRules }` with `fixture` the given value and the other three from `compileRuleSet(ruleSet, fixture)`; on failure the `compileRuleSet` Reasons. `CampaignConfig` imported with `import type`. Never throws
    - _Requirements: 13.10, 13.11, 13.12_

  - [ ] 6.11 Write `src/engine/__tests__/rules-wiring.test.ts`
    - With a `bridgeFactory` test double where the emulator is not needed: field absent gives `RunResult`s, `SliceProgress` values and `CampaignResult` deep-equal to a run with today's config; the function is called once, with every completed Run in Run_Index order including Runs restored by `resumeCampaign`; later `runSlice` calls return the same `CampaignResult`; a throwing function and a non-array function each give a sticky `internal-error` whose message says the Untriggered_Rule function failed, no `CampaignResult`, and `state()` still holding every completed Run
    - On `blink_button` (HEX via `readFileSync`, no fallback, explicit timeout): a short Rule on a signal the Fixture lacks gives COULDN'T TELL through the `Signals not mapped to a pin: ` path and never HELD; a compiled Rule_Set wired with `compileRuleSet` runs the same through `runCampaign`, `runSlice(k)` and `resumeCampaign` from a JSON round-tripped `state()`
    - `buildCampaignConfig`: `fixture` is the same value, the other fields equal `rest`, `checkerSignals` equal the compile result; invalid Rule_Set and rejected Fixture give Reasons and no config; a hand-wired config with a different Fixture runs with no equality check
    - _Requirements: 13.1, 13.3, 13.4, 13.5, 13.8, 13.9, 13.10, 13.11, 13.12_

- [ ] 7. Checkpoint - trigger check, verdict and Campaign wiring
  - Run `npm run typecheck`, `npm run guard` and the full `npx vitest --run` with no filter. Report `git diff --exit-code HEAD -- src/engine/__tests__/ fixtures/` (expected: no difference) and `git status --short`.
  - Ensure all tests pass. If a committed test or a user-dictated acceptance test fails, stop and report the expectation, the actual value and the evidence, and wait for the user (Req 17.6). Ask the user if questions arise.

- [ ] 8. Spike wrapper, spike IR campaign, step-size invariance, copy and source tests
  - [ ] 8.1 Replace the body of `src/engine/spike/led-timeout-monitor.ts` with the compiled-Rule wrapper
    - Same exports, names, parameter order, defaults and string literals (`checkLedTimeout`, `MonitorViolation`, `MonitorClean`, `MonitorResult`); header comment says the file wraps one compiled Rule; imports `../rules/compile` and `../rules/ir`
    - Argument checks in the design order, each thrown as `new Error(reason)` before any Rule_Checker call: `signal` by `isSignalName`; `maxOnCycles` integer 1 to 159,999,999,999; `runEndCycle` non-negative integer, then at most 9,007,199,254,740,991 (`runEndCycle must be at most 9007199254740991`); per element of `events` for `signal` at original index i: non-integer `cycle`, `cycle` above 9,007,199,254,740,991 (`events[<i>].cycle must be at most 9007199254740991`, replacing the above-`runEndCycle` Reason), above `runEndCycle`, below the previous element's cycle. No argument text copied
    - Compile `notLongerThan(eq(signal, 1), maxOnCycles / 16_000)` against `{ clockHz: 16_000_000, pins: [{ signal, port: "B", bit: 5, direction: "output" }] }`; call the checker with the `stepIndex` 0 observation (`cycle` `runEndCycle`, the filtered events) and, only without a Violation, the end-of-run observation; return the result shapes of Req 14.5, `'no violation in this run'` also when a `CannotCheck` is returned
    - Committed test that must pass unchanged: `src/engine/__tests__/spike-monitor.test.ts` (all four tests). The other committed tests listed in task 6.5 must also still pass. If one fails, stop and report per Req 17.6
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6, 14.7_

  - [ ] 8.2 Write the wrapper examples in `src/engine/__tests__/rules-spike-wrapper.test.ts`
    - Defaults give the Rule whose sentence is `LED is 1 must never last 300 ms or longer.`; `maxOnCycles` 1 and 159,999,999,999 accepted, 0 and 160,000,000,000 rejected
    - Each argument rejection of Req 14.7 with its exact Reason, including `runEndCycle must be at most 9007199254740991` and `events[<i>].cycle must be at most 9007199254740991`, and no `rule checker:` text ever surfacing; elements for other signals are not checked
    - An element at `runEndCycle` counts; a span with onCycle + maxOnCycles equal to `runEndCycle` is reported by the end-of-run call
    - _Requirements: 14.2, 14.5, 14.6, 14.7_

  - [ ] 8.3 Write property test S1 in `src/engine/__tests__/rules-spike-wrapper.test.ts`
    - **Property S1: Spike wrapper equals the spike algorithm (supplementary, Req 14.6)**
    - A test-only function written from the Req 14.6 text. For `events` for one signal with at most one element per cycle, ascending cycles 0 to `runEndCycle`, values 0, 1 or `"input"`, `runEndCycle` 0 to 50,000 and `maxOnCycles` 1 to 20,000, `checkLedTimeout` returns the same result
    - Seed: one literal recorded in the file, never changed. numRuns 200 (no emulator)
    - Counters asserted > 0 after `fc.assert`: `broke`, `clean`, `offAtLimit`, `offBeforeLimit`
    - **Validates: Requirements 14.6**

  - [ ] 8.4 Write the spike IR campaign test in `src/engine/__tests__/rules-spike-campaign.test.ts`
    - Read `fixtures/blink_button/build/blink_button.ino.hex` (no fallback); parse `LED is 1 must never last 300 ms or longer.`; write the one-Rule Rule_Set with `writeIr`, read it back with `readIr`, check deep equality and use the read-back set from then on; compile it against `{ pins: [BUTTON D2 input, LED B5 output] }` with no `clockHz`
    - Run through `createCampaign` with the compiled `checker` and `checkerSignals`, `gremlinSet: []`, `runs: 1`, `runCycles: 20_000_000` and a `campaignSeed` literal recorded in the file (D12), then `runSlice(1)` on the handle. The design text names `runCampaign`, which calls `createCampaign` but returns no `RunResult`; the handle gives the `RunResult` list and `endCycle` the checks need
    - Take the Run whose `runIndex` equals `violatingRunIndex`; check BROKE and `violation.rule` equal to the sentence; check `violation.cycle` equals onCycle + 4,800,000, onCycle being the latest `LED` event of value 1 whose preceding `LED` event has another value among events with `cycle` ≤ `violation.cycle` − 4,800,000; check `violation.cycle` equals `checkLedTimeout(outputEvents, endCycle).violationCycle` for that Run. These checks are acceptance tests
    - Timeout 120,000 ms
    - _Requirements: 14.4_

  - [ ] 8.5 Write property test for step-size invariance in `src/engine/__tests__/rules-campaign.property.test.ts`
    - **Property 5: Step-size invariance on the bridge**
    - HEX from `blink_button`, `floating_input` and `analog_read` (`readFileSync`, no fallback) with the design Fixtures; Gremlin_Sets from catalogue entries with targets on that Fixture; 1 to 3 Runs; Run_Cycles 30,000 to 400,000; `campaignSeed` from `fc.integer({ min: 0, max: 0xffffffff })`; Rules from the per-HEX templates with the `aimBroke`/`aimClean` branch (`LED is 0 must never last d ms or longer.` with W from 1,600 to Run_Cycles − 10,000, or W above Run_Cycles + 64) plus 0 to 2 further template Rules; Rule_Set compiled and wired through `compileRuleSet`
    - `maxStepCycles` 160,000 and 16,000 give the same `verdict` string, the same `trace.violation.rule` and `trace.violation.cycle` when BROKE, and the same `text` when HELD. The BROKE `unchecked` list is not compared (design "Step-size invariance and floating inputs")
    - Seed: one literal recorded in the file, never changed. numRuns 20 (emulator). Timeout 120,000 ms
    - Counters asserted > 0 after `fc.assert`: `broke`, `notBroke` (from the 160,000 result), `blinkButton`, `floatingInput`, `analogRead`
    - **Validates: Requirements 10.9, 13.1, 13.5**

  - [ ] 8.6 Write `src/engine/__tests__/rules-copy.test.ts`
    - Scan for `BANNED_WORDS` (imported from `copy-rules.ts`) with the matcher of `copy-rules.test.ts` (case-insensitive, not preceded or followed by a letter, digit, `_` or `-`): every fixed Reason text of the design "Error Handling" tables, every `CannotCheck` reason with a neutral signal name, the trigger reason for 0, 1 and 2 runs, the Reasons produced by the rejection examples of `readIr`, `render`, `parse`, `readRulesFile`, `compileRuleSet`, `buildCampaignConfig` and `checkLedTimeout`, and rendered sentences from `arbRule` cases
    - _Requirements: 15.8, 15.9_

  - [ ] 8.7 Write `src/engine/__tests__/rules-source.test.ts`
    - For every `.ts` file under `src/engine/rules/` and for `src/engine/spike/led-timeout-monitor.ts`: imports are relative modules under `src/engine/` only; no `avr8js`, `emulator-bridge` or `prng` import; `campaign` only through `import type`; no line (comments included) contains the guard "b" and "b2" patterns, `process.hrtime`, `setImmediate`, `queueMicrotask` or a bare `Date(`
    - `package.json` dependencies are unchanged from the pinned list (no package added)
    - _Requirements: 13.6, 15.1, 15.2, 15.3, 15.4_

- [ ] 9. Final checkpoint - full run, timing report and cleanup
  - Run `npm run typecheck`, `npm run guard` and the full `npx vitest --run` with no filter. Report `git diff --exit-code HEAD -- src/engine/__tests__/ fixtures/` (expected: no difference), `git status --short` (expected: only `src/engine/rules/`, `src/engine/verdict.ts`, `src/engine/campaign.ts`, `src/engine/spike/led-timeout-monitor.ts` and the new `src/engine/__tests__/rules-*` files, plus files already modified or untracked at the start), and `git rev-parse HEAD` (unchanged).
  - Timing report, measured, not estimated. Run `npx vitest --run --reporter=verbose --reporter=json --outputFile.json=$env:TEMP\hexorcist-rules-vitest.json` (if the installed vitest rejects `--outputFile.json`, use `--reporter=json --outputFile=<path>` plus a plain run for the verbose list, and say which was used). From the JSON, print `name` and `endTime - startTime` for every new test file: `rules-sentence.property`, `rules-ir.property`, `rules-checker.property`, `rules-campaign.property`, `rules-verdict.property`, `rules-trigger.property`, `rules-prefix.property`, `rules-templates`, `rules-ir`, `rules-duration`, `rules-file`, `rules-compile`, `rules-monitor`, `rules-verdict`, `rules-wiring`, `rules-spike-campaign`, `rules-spike-wrapper`, `rules-copy`, `rules-source`, and their sum. Set them beside the design "Test time budget" rows (Property 5 about 1.1 s, spike IR test about 0.3 s, wiring examples about 0.1 s, Property 4 about 5 s, other properties and examples about 8 s, collection and transform about 6 s, total about 20.5 s, cap 60 s).
  - Total suite time: the wall `Duration` of the full run. Added time: that `Duration` minus the `Duration` of the same command with the new files excluded (`--exclude "**/rules-*.test.ts" --exclude "**/node_modules/**"`, because `--exclude` replaces the default list). This excluded run is for measurement only; the done check above is the unfiltered run. Report both durations, the difference and the per-file table.
  - If the added time is above 60 seconds, report the per-file table to the user before any change. Only after the user agrees, apply the design levers in order (Property 5 Run_Cycles to 200,000, then the Property 4 Occurrence cap to 20), then re-measure and report. `numRuns` is never lowered.
  - Delete the temporary JSON file and every debug script or scratch file. Do not commit.
  - Ensure all tests pass. If a committed test or a user-dictated acceptance test fails, stop and report the expectation, the actual value and the evidence, and wait for the user (Req 17.6). Ask the user if questions arise.

## Notes

- No task is optional. Properties 1 to 9 and S1 are required, and every test task is required; no task carries `*`.
- Property 1 sits in task 2.5, after `parse.ts` (task 2.1), because it calls `parse`. Phase 1 holds Property 2 and the Renderer, IR and Window_Cycles example tests.
- `compileRuleSet` is built in task 4.5 with `checker` and `checkerSignals`; task 6.2 adds `findUntriggeredRules` once `trigger.ts` exists, so no code waits on a later module.
- The spike IR test (task 8.4) uses `createCampaign` plus `runSlice(1)`, as Req 14.4 states, because it needs the violating `RunResult` and its `endCycle`.
- No task writes a baseline file, and the agent never commits.
- Passing tests are evidence, not proof. Property tests sample inputs and do not cover every case.
- The Requirement 16.12 example coverage is spread over tasks 1.6, 1.7, 2.4, 4.6, 4.7 and 6.6.
- Requirement 17 is enforced by the rules section and the checkpoints, not by a separate task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["1.5"] },
    { "id": 5, "tasks": ["1.6"] },
    { "id": 6, "tasks": ["1.7"] },
    { "id": 7, "tasks": ["1.8"] },
    { "id": 8, "tasks": ["1.9"] },
    { "id": 9, "tasks": ["1.10"] },
    { "id": 10, "tasks": ["2.1"] },
    { "id": 11, "tasks": ["2.2"] },
    { "id": 12, "tasks": ["2.3"] },
    { "id": 13, "tasks": ["2.4"] },
    { "id": 14, "tasks": ["2.5"] },
    { "id": 15, "tasks": ["2.6"] },
    { "id": 16, "tasks": ["2.7"] },
    { "id": 17, "tasks": ["2.8"] },
    { "id": 18, "tasks": ["4.1"] },
    { "id": 19, "tasks": ["4.2"] },
    { "id": 20, "tasks": ["4.3"] },
    { "id": 21, "tasks": ["4.4"] },
    { "id": 22, "tasks": ["4.5"] },
    { "id": 23, "tasks": ["4.6"] },
    { "id": 24, "tasks": ["4.7"] },
    { "id": 25, "tasks": ["4.8"] },
    { "id": 26, "tasks": ["4.9"] },
    { "id": 27, "tasks": ["6.1"] },
    { "id": 28, "tasks": ["6.2"] },
    { "id": 29, "tasks": ["6.3"] },
    { "id": 30, "tasks": ["6.4"] },
    { "id": 31, "tasks": ["6.5"] },
    { "id": 32, "tasks": ["6.6"] },
    { "id": 33, "tasks": ["6.7"] },
    { "id": 34, "tasks": ["6.8"] },
    { "id": 35, "tasks": ["6.9"] },
    { "id": 36, "tasks": ["6.10"] },
    { "id": 37, "tasks": ["6.11"] },
    { "id": 38, "tasks": ["8.1"] },
    { "id": 39, "tasks": ["8.2"] },
    { "id": 40, "tasks": ["8.3"] },
    { "id": 41, "tasks": ["8.4"] },
    { "id": 42, "tasks": ["8.5"] },
    { "id": 43, "tasks": ["8.6"] },
    { "id": 44, "tasks": ["8.7"] }
  ]
}
```
