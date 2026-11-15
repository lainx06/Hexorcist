# Spike Results

<!-- bench:raw:start -->
## S5: Benchmark (Node, avr8js)

- **Node version:** v26.13.1
- **avr8js version:** 0.21.1
- **OS:** Windows_NT 10.0.26200 (x64)
- **Total cycles:** 160,000,000
- **Wall seconds:** 3.546
- **Simulated seconds per real second:** 2.82
- **Date:** 2026-11-14
<!-- bench:raw:end -->

## Browser observations (user, 2026-11-12)

- S1 PASS: LED toggles 31.484 / 31.984 / 32.483 / 32.983 s simulated; cycle gaps 8,011,824 and 7,995,334.
- S2 PASS: holding the button gave toggles 0.1 s apart (30.483 to 30.983 s); cycle gap 1,605,688.
- Console: no errors.

## S3/S4

released run = BROKE at onCycle + 4,800,000 (LED on longer than 300 ms); held run = no violation; replay in chunks of 1,000 / 160,000 / one call = same violation cycle; LED still on at run end is detected (test 4).

<!-- bench:campaign:start -->
## Campaign speed (2026-11-13, Node v26.13.1)
Script: `npm run bench:campaign` (bench/campaign-bench.ts). blink_button, 6 gremlins at defaults, campaignSeed 1, N 64, Run_Cycles 8,000,000, stopOnFirstViolation true, Checker never reports a violation. Ratio = campaign cycles/s divided by raw cycles/s. Steps and events are min / avg / max per run. Two runs, same machine. Wall time includes the Checker calls and the plain-data copies the campaign makes.

| Case | Run | Wall s | Emulated cycles | Cycles/s | Steps per run | Events applied per run | Ratio |
|---|---|---|---|---|---|---|---|
| 1. Raw, one advance(160,000,000) | 1 | 3.505 | 160,000,000 | 45,648,453 | n/a | n/a | n/a |
| 1. Raw | 2 | 3.444 | 160,000,000 | 46,453,364 | n/a | n/a | n/a |
| 2. Campaign, default maxStepCycles (160,000) | 1 | 11.273 | 512,000,024 | 45,420,004 | 54 / 58.2 / 63 | 6 / 12.2 / 20 | 0.995 |
| 2. Campaign, default | 2 | 11.236 | 512,000,024 | 45,567,329 | 54 / 58.2 / 63 | 6 / 12.2 / 20 | 0.981 |
| 3. Campaign, maxStepCycles 1,600,000 | 1 | 11.286 | 512,000,024 | 45,366,221 | 10 / 15.1 / 23 | 6 / 12.2 / 20 | 0.994 |
| 3. Campaign, maxStepCycles 1,600,000 | 2 | 10.961 | 512,000,024 | 46,709,233 | 10 / 15.1 / 23 | 6 / 12.2 / 20 | 1.006 |
<!-- bench:campaign:end -->

<!-- bench:examples:start -->
## Example campaign speed (Node v26.13.1, standalone via tsx)
Script: `npm run bench:examples` (bench/example-campaign-bench.ts). Windows_NT 10.0.26200 (x64), AMD Ryzen 7 7800X3D 8-Core Processor x16. Standalone run, not under Vitest. Each case ran twice, one after another. Crosswalk meta: N 24, Run_Cycles 16,000,000, campaignSeed 20261101, gremlin `masher`. Raw cases step in 160,000-cycle steps to 16,000,000, 3 runs each; the crosswalk raw cases get the Fixture's Rest_Events and no gremlin events; blink_button gets no events (as in E9b). (b) is `runExampleCampaign(ex, "fixed")`, so its seconds also include `buildCampaignConfig`. (b+) is the same compiled Rule_Checker wrapped only to count calls. (c) injects a checker that never reports, through `CampaignConfig.checker`; everything else is the config of (b). Steps = checker calls per run minus the end-of-run call.

| Case | Repeat | Total cycles | Seconds | Cycles/s | Steps/run (min / avg / max) | Out edges/run (min / avg / max) | Checker calls | Events applied/run (min / avg / max) |
|---|---|---|---|---|---|---|---|---|
| (a) raw, crosswalk fixed.hex | 1 | 48,000,003 | 2.377 | 20,197,474 | n/a | n/a | n/a | n/a |
| (a) raw, crosswalk fixed.hex | 2 | 48,000,003 | 2.333 | 20,578,203 | n/a | n/a | n/a | n/a |
| (b) campaign, runExampleCampaign | 1 | 384,000,014 | 19.707 | 19,485,531 | n/a (checker not wrapped) | 12 / 18.7 / 22 | n/a (checker not wrapped) | 2 / 6.0 / 12 |
| (b) campaign, runExampleCampaign | 2 | 384,000,014 | 19.656 | 19,536,423 | n/a (checker not wrapped) | 12 / 18.7 / 22 | n/a (checker not wrapped) | 2 / 6.0 / 12 |
| (b+) campaign, Rule_Checker wrapped to count | 1 | 384,000,014 | 19.552 | 19,640,221 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (b+) campaign, Rule_Checker wrapped to count | 2 | 384,000,014 | 19.776 | 19,417,726 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (c) campaign, checker never reports | 1 | 384,000,014 | 19.593 | 19,598,884 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (c) campaign, checker never reports | 2 | 384,000,014 | 19.780 | 19,413,288 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (d1) raw, crosswalk buggy.hex | 1 | 48,000,003 | 2.448 | 19,609,313 | n/a | n/a | n/a | n/a |
| (d1) raw, crosswalk buggy.hex | 2 | 48,000,003 | 2.417 | 19,855,826 | n/a | n/a | n/a | n/a |
| (d2) raw, blink_button HEX (E9b) | 1 | 48,000,000 | 1.113 | 43,110,103 | n/a | n/a | n/a | n/a |
| (d2) raw, blink_button HEX (E9b) | 2 | 48,000,000 | 1.077 | 44,548,320 | n/a | n/a | n/a | n/a |

Reading (evidence, not proof):
- The campaign path adds no visible cost on this firmware. Campaign speed (about 19.5M cycles/s, cases b, b+, c) matches raw speed on the same HEX (about 20M cycles/s, cases a, d1). Swapping the compiled Rule_Checker for a checker that never reports changed the time by less than the spread between repeats (19.4 to 19.8 s).
- The crosswalk firmware itself runs at about 20M cycles/s raw, against about 44M for blink_button (d2, which matches E9b's 45M). That is a factor of about 2.2 before any campaign code runs. This run does not say why the crosswalk HEX is slower in the emulator.
- Standalone, the fixed campaign took about 19.7 s. The Vitest run measured 74.8 s. The remaining factor of about 3.8 appeared only under Vitest. This bench never ran the campaign under Vitest, so it does not show which part of Vitest (module transform, other test files running in parallel workers, the environment, or something else) causes it. The 74.8 s figure came from a different run than these numbers.
- So the 9x gap against E9b splits into about 2.2x firmware and about 3.8x seen only inside Vitest, by these numbers. The campaign path with the compiled Rule_Checker is not the cause. The browser app runs the same campaign path, and this data suggests it would run at the standalone speed on this machine, but no browser run was made here.

Rerun after D27 (same machine and Node version, standalone via tsx). The bench now imports `tests/examples/examples-support.ts` normally, and the helper takes its folder from `fileURLToPath(new URL(".", import.meta.url))`. The earlier numbers above are kept as measured. Under D24 the standalone time of the fixed campaign (case b) is the time that is judged: 18.975 s and 18.764 s, above the 12,000 ms report level and below the 30,000 ms stop limit.

| Case | Repeat | Total cycles | Seconds | Cycles/s |
|---|---|---|---|---|
| (a) raw, crosswalk fixed.hex | 1 | 48,000,003 | 2.264 | 21,204,962 |
| (a) raw, crosswalk fixed.hex | 2 | 48,000,003 | 2.217 | 21,655,756 |
| (b) campaign, runExampleCampaign | 1 | 384,000,014 | 18.975 | 20,236,992 |
| (b) campaign, runExampleCampaign | 2 | 384,000,014 | 18.764 | 20,465,120 |
| (b+) campaign, Rule_Checker wrapped to count | 1 | 384,000,014 | 19.080 | 20,125,399 |
| (b+) campaign, Rule_Checker wrapped to count | 2 | 384,000,014 | 19.686 | 19,505,892 |
| (c) campaign, checker never reports | 1 | 384,000,014 | 19.483 | 19,709,084 |
| (c) campaign, checker never reports | 2 | 384,000,014 | 19.387 | 19,807,473 |
| (d1) raw, crosswalk buggy.hex | 1 | 48,000,003 | 2.385 | 20,127,822 |
| (d1) raw, crosswalk buggy.hex | 2 | 48,000,003 | 2.374 | 20,215,465 |
| (d2) raw, blink_button HEX (E9b) | 1 | 48,000,000 | 1.119 | 42,904,798 |
| (d2) raw, blink_button HEX (E9b) | 2 | 48,000,000 | 1.073 | 44,736,091 |

Garage case (D28, sub-task 6.8; same machine and Node version, standalone via tsx). Case (e) is `runExampleCampaign(loadExample("garage"), "fixed")`, built the same way as (b), so its seconds also include `buildCampaignConfig`. Garage meta: N 40, Run_Cycles 10,000,000, campaignSeed 20261102, gremlins `bouncer`, `masher`. Under D24 the standalone time is 16.854 s and 16.848 s, above the 12,000 ms report level and below the 30,000 ms stop limit. The same run measured crosswalk case (b) at 20.669 s and 20.768 s. The other cases in that run are not repeated here.

| Case | Repeat | Total cycles | Seconds | Cycles/s | Out edges/run (min / avg / max) | Events applied/run (min / avg / max) |
|---|---|---|---|---|---|---|
| (e) campaign, garage fixed, runExampleCampaign | 1 | 400,000,018 | 16.854 | 23,732,985 | 8 / 10.7 / 14 | 3 / 10.1 / 17 |
| (e) campaign, garage fixed, runExampleCampaign | 2 | 400,000,018 | 16.848 | 23,741,885 | 8 / 10.7 / 14 | 3 / 10.1 / 17 |

Heartbeat case (D28, sub-task 8.8; same machine and Node version, standalone via tsx). Case (f) is `runExampleCampaign(loadExample("heartbeat"), "fixed")`, built the same way as (b) and (e), so its seconds also include `buildCampaignConfig`. Heartbeat meta: N 24, Run_Cycles 16,000,000, campaignSeed 20261103, gremlin `stuck`. Under D24 the standalone time is 8.652 s and 8.296 s, below the 12,000 ms report level. The same run measured crosswalk case (b) at 18.631 s and 18.506 s, and garage case (e) at 17.806 s and 17.560 s. The other cases in that run are not repeated here.

| Case | Repeat | Total cycles | Seconds | Cycles/s | Out edges/run (min / avg / max) | Events applied/run (min / avg / max) |
|---|---|---|---|---|---|---|
| (f) campaign, heartbeat fixed, runExampleCampaign | 1 | 384,000,010 | 8.652 | 44,380,976 | 6 / 6.0 / 6 | 2 / 2.0 / 2 |
| (f) campaign, heartbeat fixed, runExampleCampaign | 2 | 384,000,010 | 8.296 | 46,285,752 | 6 / 6.0 / 6 | 2 / 2.0 / 2 |

Edits to the bench path: the section had no text about the `__dirname` workaround, so nothing was removed from it. The workaround itself (a `globalThis.__dirname` assignment and a dynamic import in the bench script) is gone from the code.
<!-- bench:examples:end -->

## Output scan fix

Kept: Option B (spec bridge-output-scan). `EmulatorBridge.advance()` resolves the digital output pins once in `_build` (Option A). It also skips the per-instruction output scan unless, since the last scan, a listener on a port that holds an output pin fired, an input was applied, or a watched DDRx byte changed (Option B). The preservation test replays 41 recorded cases, and they match the baseline recorded on the unchanged bridge. That is evidence, not proof.

All figures were measured on one machine, standalone under `tsx`, not under Vitest and not in a browser. Before and after were taken in one session on 2026-11-15.

- Node: v26.13.1 (before), v26.13.1 (after)
- OS and CPU: Windows_NT 10.0.26200 (x64), AMD Ryzen 7 7800X3D 8-Core Processor            x16 (before), Windows_NT 10.0.26200 (x64), AMD Ryzen 7 7800X3D 8-Core Processor            x16 (after)

### Raw cycles/s

Method: a fresh bridge per run, no input events, 160,000-cycle steps to 16,000,000 cycles. Each figure is the median of 3 runs, with the 3 runs in brackets. avr8js alone is the same HEX on `CPU` (2048 bytes SRAM) with ports B/C/D, Timer0/1/2 and the ADC, looping `avrInstruction` and `tick` to 16,000,000 cycles. It was measured in both sessions for reference. Those runs are noisy on this machine (heartbeat/fixed ranged from 67 to 114 million cycles/s), so the after pwm_out bridge median lands above that session's avr8js-alone median.

| HEX | Fixture | Bridge before | Bridge after | After / before | avr8js alone (before session) | avr8js alone (after session) |
|---|---|---|---|---|---|---|
| `examples/crosswalk/fixed/fixed.hex` | `examples/crosswalk/fixture.json` | 20,158,835 (20,608,148 / 19,432,419 / 20,158,835) | 80,796,252 (80,796,252 / 85,919,701 / 72,480,317) | 4.01 | 107,125,384 (105,404,906 / 108,371,355 / 107,125,384) | 107,868,836 (102,023,971 / 107,868,836 / 108,622,014) |
| `examples/heartbeat/fixed/fixed.hex` | `examples/heartbeat/fixture.json` | 47,944,054 (46,195,444 / 47,944,054 / 48,014,251) | 84,860,243 (64,243,896 / 84,860,243 / 85,894,050) | 1.77 | 76,524,675 (67,410,745 / 76,524,675 / 97,153,824) | 113,005,371 (113,722,713 / 113,005,371 / 110,696,697) |
| `fixtures/blink_button/build/blink_button.ino.hex` | BUTTON PD2 input, LED PB5 output (choice C9) | 40,651,439 (39,029,835 / 40,651,439 / 42,434,510) | 78,506,261 (76,345,093 / 78,506,261 / 79,069,705) | 1.93 | 89,880,975 (88,271,138 / 90,136,275 / 89,880,975) | 89,153,278 (99,262,049 / 88,204,714 / 89,153,278) |
| `fixtures/pwm_out/build/pwm_out.ino.hex` | `fixtures/pwm_out/fixture.json` | 24,583,324 (24,278,566 / 24,583,324 / 24,800,895) | 66,416,801 (57,866,519 / 66,940,089 / 66,416,801) | 2.70 | 79,355,632 (82,549,543 / 79,355,632 / 75,639,210) | 58,386,702 (58,386,702 / 52,007,574 / 69,678,490) |

### `npm run bench:examples`, before (unchanged bridge)

Copied unchanged from the script output. 2 repeats per case. Each raw row is 3 runs of 16,000,000 cycles. Each campaign row is the Example's `meta.runs` runs (crosswalk 24, garage 40, heartbeat 24). The crosswalk raw rows apply Rest_Events, so they are not the same measurement as the raw table above, which applies no input events.

| Case | Repeat | Total cycles | Seconds | Cycles/s | Steps/run (min / avg / max) | Out edges/run (min / avg / max) | Checker calls | Events applied/run (min / avg / max) |
|---|---|---|---|---|---|---|---|---|
| (a) raw, crosswalk fixed.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 1 | 48,000,003 | 2.479 | 19,360,289 | n/a | n/a | n/a | n/a |
| (a) raw, crosswalk fixed.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 2 | 48,000,003 | 2.771 | 17,320,349 | n/a | n/a | n/a | n/a |
| (b) campaign, runExampleCampaign (compiled Rule_Checker); seconds include config build | 1 | 384,000,014 | 23.150 | 16,587,517 | n/a (checker not wrapped in this case) | 12 / 18.7 / 22 | n/a (checker not wrapped in this case) | 2 / 6.0 / 12 |
| (b) campaign, runExampleCampaign (compiled Rule_Checker); seconds include config build | 2 | 384,000,014 | 23.009 | 16,688,821 | n/a (checker not wrapped in this case) | 12 / 18.7 / 22 | n/a (checker not wrapped in this case) | 2 / 6.0 / 12 |
| (b+) campaign, compiled Rule_Checker wrapped to count calls | 1 | 384,000,014 | 22.876 | 16,786,270 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (b+) campaign, compiled Rule_Checker wrapped to count calls | 2 | 384,000,014 | 22.834 | 16,817,317 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (c) campaign, checker never reports | 1 | 384,000,014 | 23.018 | 16,682,696 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (c) campaign, checker never reports | 2 | 384,000,014 | 22.964 | 16,721,973 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (d1) raw, crosswalk buggy.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 1 | 48,000,003 | 2.806 | 17,105,085 | n/a | n/a | n/a | n/a |
| (d1) raw, crosswalk buggy.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 2 | 48,000,003 | 2.931 | 16,377,339 | n/a | n/a | n/a | n/a |
| (d2) raw, blink_button HEX (E9b), no events, 3 x 16,000,000 in 160,000 steps | 1 | 48,000,000 | 1.220 | 39,357,721 | n/a | n/a | n/a | n/a |
| (d2) raw, blink_button HEX (E9b), no events, 3 x 16,000,000 in 160,000 steps | 2 | 48,000,000 | 1.185 | 40,505,273 | n/a | n/a | n/a | n/a |
| (e) campaign, garage fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 1 | 400,000,018 | 18.723 | 21,363,545 | n/a (checker not wrapped in this case) | 8 / 10.7 / 14 | n/a (checker not wrapped in this case) | 3 / 10.1 / 17 |
| (e) campaign, garage fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 2 | 400,000,018 | 18.872 | 21,195,298 | n/a (checker not wrapped in this case) | 8 / 10.7 / 14 | n/a (checker not wrapped in this case) | 3 / 10.1 / 17 |
| (f) campaign, heartbeat fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 1 | 384,000,010 | 9.225 | 41,624,039 | n/a (checker not wrapped in this case) | 6 / 6.0 / 6 | n/a (checker not wrapped in this case) | 2 / 2.0 / 2 |
| (f) campaign, heartbeat fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 2 | 384,000,010 | 8.871 | 43,286,349 | n/a (checker not wrapped in this case) | 6 / 6.0 / 6 | n/a (checker not wrapped in this case) | 2 / 2.0 / 2 |

### `npm run bench:examples`, after (Option B)

Same script, same machine, same session. Out edges per run and events applied per run match the before table.

| Case | Repeat | Total cycles | Seconds | Cycles/s | Steps/run (min / avg / max) | Out edges/run (min / avg / max) | Checker calls | Events applied/run (min / avg / max) |
|---|---|---|---|---|---|---|---|---|
| (a) raw, crosswalk fixed.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 1 | 48,000,003 | 0.718 | 66,848,033 | n/a | n/a | n/a | n/a |
| (a) raw, crosswalk fixed.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 2 | 48,000,003 | 0.569 | 84,316,430 | n/a | n/a | n/a | n/a |
| (b) campaign, runExampleCampaign (compiled Rule_Checker); seconds include config build | 1 | 384,000,014 | 5.333 | 72,002,980 | n/a (checker not wrapped in this case) | 12 / 18.7 / 22 | n/a (checker not wrapped in this case) | 2 / 6.0 / 12 |
| (b) campaign, runExampleCampaign (compiled Rule_Checker); seconds include config build | 2 | 384,000,014 | 5.545 | 69,257,516 | n/a (checker not wrapped in this case) | 12 / 18.7 / 22 | n/a (checker not wrapped in this case) | 2 / 6.0 / 12 |
| (b+) campaign, compiled Rule_Checker wrapped to count calls | 1 | 384,000,014 | 5.281 | 72,712,524 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (b+) campaign, compiled Rule_Checker wrapped to count calls | 2 | 384,000,014 | 5.318 | 72,206,922 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (c) campaign, checker never reports | 1 | 384,000,014 | 5.545 | 69,246,626 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (c) campaign, checker never reports | 2 | 384,000,014 | 5.449 | 70,471,728 | 101 / 103.3 / 107 | 12 / 18.7 / 22 | 2,503 | 2 / 6.0 / 12 |
| (d1) raw, crosswalk buggy.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 1 | 48,000,003 | 0.699 | 68,707,002 | n/a | n/a | n/a | n/a |
| (d1) raw, crosswalk buggy.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps | 2 | 48,000,003 | 0.650 | 73,832,891 | n/a | n/a | n/a | n/a |
| (d2) raw, blink_button HEX (E9b), no events, 3 x 16,000,000 in 160,000 steps | 1 | 48,000,000 | 0.712 | 67,379,731 | n/a | n/a | n/a | n/a |
| (d2) raw, blink_button HEX (E9b), no events, 3 x 16,000,000 in 160,000 steps | 2 | 48,000,000 | 0.715 | 67,130,933 | n/a | n/a | n/a | n/a |
| (e) campaign, garage fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 1 | 400,000,018 | 6.578 | 60,807,054 | n/a (checker not wrapped in this case) | 8 / 10.7 / 14 | n/a (checker not wrapped in this case) | 3 / 10.1 / 17 |
| (e) campaign, garage fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 2 | 400,000,018 | 6.423 | 62,277,046 | n/a (checker not wrapped in this case) | 8 / 10.7 / 14 | n/a (checker not wrapped in this case) | 3 / 10.1 / 17 |
| (f) campaign, heartbeat fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 1 | 384,000,010 | 5.286 | 72,647,253 | n/a (checker not wrapped in this case) | 6 / 6.0 / 6 | n/a (checker not wrapped in this case) | 2 / 2.0 / 2 |
| (f) campaign, heartbeat fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build | 2 | 384,000,010 | 5.603 | 68,540,167 | n/a (checker not wrapped in this case) | 6 / 6.0 / 6 | n/a (checker not wrapped in this case) | 2 / 2.0 / 2 |
