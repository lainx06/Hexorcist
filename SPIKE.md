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
