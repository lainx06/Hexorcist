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

Edits to the bench path: the section had no text about the `__dirname` workaround, so nothing was removed from it. The workaround itself (a `globalThis.__dirname` assignment and a dynamic import in the bench script) is gone from the code.
<!-- bench:examples:end -->
