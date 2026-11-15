# honest-verdicts report notes

## Calibration inventory and results (task 1)

Script: scripts/tmp-calibrate.ts (deleted after the run). Command: npx tsx scripts/tmp-calibrate.ts. Exit code 0. src/ unchanged during the run (git status --porcelain src/ empty).

Cases: 24 Example Runs (runOne, Run_Index 0-3, committed campaignSeed, checker never reports a violation, to runCycles), 7 fixture-program runs at 16,000,000 cycles, and every case of src/engine/__tests__/baselines/bridge-output-scan-preservation.json with its own event list. Each case also ran on a bridge without logging; endCycle, outputEvents, appliedInputs and diagnostics compared equal.

```text
| Program | Run | Fixture source | Events | Run length | End cycle | Logged accesses | Logged vs unlogged |
|---|---|---|---|---|---|---|---|
| crosswalk/buggy | run 0 | examples/crosswalk/meta.json seed 20261101 | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/buggy | run 1 | examples/crosswalk/meta.json seed 20261101 | 4 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/buggy | run 2 | examples/crosswalk/meta.json seed 20261101 | 6 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/buggy | run 3 | examples/crosswalk/meta.json seed 20261101 | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | run 0 | examples/crosswalk/meta.json seed 20261101 | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | run 1 | examples/crosswalk/meta.json seed 20261101 | 4 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | run 2 | examples/crosswalk/meta.json seed 20261101 | 6 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | run 3 | examples/crosswalk/meta.json seed 20261101 | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| garage/buggy | run 0 | examples/garage/meta.json seed 20261102 | 6 | 10,000,000 | 10,000,001 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/buggy | run 1 | examples/garage/meta.json seed 20261102 | 5 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/buggy | run 2 | examples/garage/meta.json seed 20261102 | 5 | 10,000,000 | 10,000,001 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/buggy | run 3 | examples/garage/meta.json seed 20261102 | 6 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | run 0 | examples/garage/meta.json seed 20261102 | 6 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | run 1 | examples/garage/meta.json seed 20261102 | 5 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | run 2 | examples/garage/meta.json seed 20261102 | 5 | 10,000,000 | 10,000,001 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | run 3 | examples/garage/meta.json seed 20261102 | 6 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| heartbeat/buggy | run 0 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/buggy | run 1 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/buggy | run 2 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/buggy | run 3 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | run 0 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | run 1 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | run 2 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,002 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | run 3 | examples/heartbeat/meta.json seed 20261103 | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | BUTTON/LED, no events | src/engine/__tests__/rules-arbitraries-campaign.ts:14-19 | 0 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | BUTTON/LED, BUTTON=1 at 0 | bench/benchmark.ts:28-33,50-52 | 1 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | BUTTON/LED/POT, no events | src/engine/__tests__/campaign.property.test.ts:35-37 | 0 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| floating_input | LED/D3_IN/D4_IN, no events | src/engine/__tests__/rules-arbitraries-campaign.ts:20-26 | 0 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @158 Disable_Write | same |
| analog_read | POT/LED, no events | src/engine/__tests__/rules-arbitraries-campaign.ts:27-32 | 0 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | LED/POT, no events | src/engine/__tests__/adc-roundtrip.test.ts:24 | 0 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| pwm_out | PWM_A/PWM_B/LED, no events | fixtures/pwm_out/fixture.json | 0 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @300 Disable_Write | same |
| crosswalk/buggy | baseline crosswalk/buggy/run0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/buggy | baseline crosswalk/buggy/run1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 4 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/buggy | baseline crosswalk/buggy/run2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 6 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/buggy | baseline crosswalk/buggy/run3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | baseline crosswalk/fixed/run0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | baseline crosswalk/fixed/run1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 4 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | baseline crosswalk/fixed/run2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 6 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @264 Disable_Write | same |
| crosswalk/fixed | baseline crosswalk/fixed/run3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 8 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @264 Disable_Write | same |
| garage/buggy | baseline garage/buggy/run0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 6 | 10,000,000 | 10,000,001 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/buggy | baseline garage/buggy/run1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 5 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/buggy | baseline garage/buggy/run2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 5 | 10,000,000 | 10,000,001 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/buggy | baseline garage/buggy/run3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 6 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | baseline garage/fixed/run0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 6 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | baseline garage/fixed/run1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 5 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | baseline garage/fixed/run2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 5 | 10,000,000 | 10,000,001 | UCSR0B write 0x00 @224 Disable_Write | same |
| garage/fixed | baseline garage/fixed/run3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 6 | 10,000,000 | 10,000,000 | UCSR0B write 0x00 @224 Disable_Write | same |
| heartbeat/buggy | baseline heartbeat/buggy/run0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/buggy | baseline heartbeat/buggy/run1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/buggy | baseline heartbeat/buggy/run2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/buggy | baseline heartbeat/buggy/run3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,001 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | baseline heartbeat/fixed/run0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | baseline heartbeat/fixed/run1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | baseline heartbeat/fixed/run2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,002 | UCSR0B write 0x00 @170 Disable_Write | same |
| heartbeat/fixed | baseline heartbeat/fixed/run3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 13 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 11 | 8,000,000 | 8,000,001 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 35 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 39 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list4 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 25 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list5 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 3 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list6 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 24 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| blink_button | baseline blink_button/list7 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 27 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @170 Disable_Write | same |
| analog_read | baseline analog_read/list0 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 11 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | baseline analog_read/list1 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 14 | 8,000,000 | 8,000,001 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | baseline analog_read/list2 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 13 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | baseline analog_read/list3 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 2 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | baseline analog_read/list4 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 29 | 8,000,000 | 8,000,001 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | baseline analog_read/list5 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 8 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | baseline analog_read/list6 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 3 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| analog_read | baseline analog_read/list7 | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 30 | 8,000,000 | 8,000,000 | UCSR0B write 0x00 @152 Disable_Write | same |
| pwm_out | baseline pwm_out | src/engine/__tests__/baselines/bridge-output-scan-preservation.json | 0 | 16,000,000 | 16,000,000 | UCSR0B write 0x00 @300 Disable_Write | same |

crosswalk/buggy:
  UCSR0B write 0x00 -> Disable_Write  count 8  first cycle 264
crosswalk/fixed:
  UCSR0B write 0x00 -> Disable_Write  count 8  first cycle 264
garage/buggy:
  UCSR0B write 0x00 -> Disable_Write  count 8  first cycle 224
garage/fixed:
  UCSR0B write 0x00 -> Disable_Write  count 8  first cycle 224
heartbeat/buggy:
  UCSR0B write 0x00 -> Disable_Write  count 8  first cycle 170
heartbeat/fixed:
  UCSR0B write 0x00 -> Disable_Write  count 8  first cycle 170
blink_button:
  UCSR0B write 0x00 -> Disable_Write  count 11  first cycle 170
floating_input:
  UCSR0B write 0x00 -> Disable_Write  count 1  first cycle 158
analog_read:
  UCSR0B write 0x00 -> Disable_Write  count 10  first cycle 152
pwm_out:
  UCSR0B write 0x00 -> Disable_Write  count 2  first cycle 300
cases 72, use 0, other 0, mismatch 0, errors 0

```

## Evidence bench (task 2)

Command: npm run bench:evidence. Exit code 0. No fixed-build BROKE. No single-press violation.

```text
seed sweep crosswalk buggy: BROKE 99, HELD 1, COULDN'T TELL 0 (102.4 s so far)
seed sweep crosswalk fixed: BROKE 0, HELD 20, COULDN'T TELL 0 (207.0 s so far)
seed sweep garage buggy: BROKE 100, HELD 0, COULDN'T TELL 0 (318.8 s so far)
seed sweep garage fixed: BROKE 0, HELD 20, COULDN'T TELL 0 (436.9 s so far)
seed sweep heartbeat buggy: BROKE 99, HELD 1, COULDN'T TELL 0 (534.3 s so far)
seed sweep heartbeat fixed: BROKE 0, HELD 20, COULDN'T TELL 0 (635.8 s so far)
single-press sweep crosswalk buggy: 94 starts, 0 with a violation, 0 with a CannotCheck
single-press sweep crosswalk fixed: 94 starts, 0 with a violation, 0 with a CannotCheck
single-press sweep garage buggy: 62 starts, 0 with a violation, 0 with a CannotCheck
single-press sweep garage fixed: 62 starts, 0 with a violation, 0 with a CannotCheck
single-press sweep heartbeat buggy: 89 starts, 0 with a violation, 0 with a CannotCheck
single-press sweep heartbeat fixed: 89 starts, 0 with a violation, 0 with a CannotCheck
wrote C:\Users\Lain\dev\Hexorcist\docs\evidence\EVIDENCE-NUMBERS.md
exit 0
```
