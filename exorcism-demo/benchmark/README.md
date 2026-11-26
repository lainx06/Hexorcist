# Benchmark: AI chat answers, checked by gremlins

This folder holds sketches that AI chat tools wrote for two briefs. Hexorcist built each one for the ATmega328P, ran seeded gremlins against it on the emulated chip, and recorded what happened.

The `.ino` files here are the chat tools' unedited answers. Each file name says which tool and setting wrote it, for example `chatgpt-fast` or `gemini-medium`. Nothing in this README says more about a tool than the results below show.

Results are evidence from this seed and this gremlin set. They are not proof.

## The briefs

**Round 2 (crossing)**

> Write a sketch for an ATmega328P board (Uno-compatible) for a pedestrian crossing. A REQUEST button is wired from pin 2 to GND (use the internal pull-up). Car lights: green on pin 8, yellow on pin 9, red on pin 10. Pedestrian lights: WALK on pin 11, DON'T WALK on pin 12. Cars have green until someone presses REQUEST. Then: yellow for 150 ms, all red for 50 ms, WALK for 200 ms, all red for 50 ms, then cars get green again. The button can be pressed at any time, including during a crossing. Don't use blocking delays. Keep it simple. Reply with the code only.

**Round 3 (motor)**

> Write a sketch for an ATmega328P board (Uno-compatible) that drives a DC motor through two transistor switches. The FORWARD switch is on pin 8 and the REVERSE switch is on pin 9 (HIGH = on). Turning both on at the same time, even for a moment, shorts the supply. Three buttons are wired to GND (use the internal pull-ups): FORWARD on pin 2, REVERSE on pin 3, STOP on pin 4. Pressing FORWARD runs the motor forward, pressing REVERSE runs it in reverse (it can switch directly from one direction to the other), and STOP turns both switches off. Keep it simple. Reply with the code only.

The sketches in `round2/` answer the crossing brief. The sketches in `round3/` answer the motor brief. `round2/chatgpt-high-kiro-fixed.ino` is the version Kiro produced in the earlier check-and-fix loop run (added in commit `b9586bf`), not a chat answer, and is not in the tables.

The four top-level sketches (`chatgpt.ino`, `claude.ino`, `deepseek.ino`, `gemini.ino`) are kept from an earlier brief and are not part of the results tables.

## How to reproduce

Run these from the repo root. Each Try_Script command copies one sketch into the work folder, builds it, and runs the headless checker. It needs the command-line sketch compiler tool installed. Its exit code is the checker's exit code: 0 for HELD, 1 for BROKE, 2 for COULDN'T TELL, 3 for an input or build error.

| Table | Config file | Seed | Gremlin set | Runs |
| --- | --- | --- | --- | --- |
| crosswalk-check | `exorcism-demo/crosswalk-check.json` | 20261101 | masher | 24 |
| crosswalk-full-check | `exorcism-demo/crosswalk-full-check.json` | 20261101 | masher,bouncer | 200 |
| motor-check | `exorcism-demo/motor-check.json` | 20261101 | masher,bouncer | 200 |

```
node exorcism-demo/try.mjs exorcism-demo/benchmark/round2/<sketch>.ino exorcism-demo/crosswalk-check.json
node exorcism-demo/try.mjs exorcism-demo/benchmark/round2/<sketch>.ino exorcism-demo/crosswalk-full-check.json
node exorcism-demo/try.mjs exorcism-demo/benchmark/round3/<sketch>.ino exorcism-demo/motor-check.json
```

After a Try_Script run, `exorcism-demo/build/sketch.hex` holds the HEX of that sketch. The overlap numbers come from the overlap script, which reads that HEX and counts CPU cycles on the emulated chip (16 MHz, so microseconds are cycles divided by 16).

Crossing, WALK and DONT_WALK together, measured on the reduced replay of try 1:

```
npx tsx --no-deprecation exorcism-demo/measure-overlap.ts exorcism-demo/build/sketch.hex examples/crosswalk/fixture.json WALK DONT_WALK --run-ms 1000 --gremlins masher,bouncer --seed 20261101 --try 1 --reduced --rules exorcism-demo/crosswalk-full-rules.txt
```

Motor, FORWARD and REVERSE together, measured across all 200 tries:

```
npx tsx --no-deprecation exorcism-demo/measure-overlap.ts exorcism-demo/build/sketch.hex exorcism-demo/motor/pins.json FORWARD REVERSE --run-ms 1000 --campaign masher,bouncer --seed 20261101 --runs 200
```

## What the verdicts mean

- **HELD**: "No violation found in N emulated runs of this gremlin set. Not a proof." The gremlins tried N times and the rule never failed. A different seed, a different gremlin set, or a longer run could still find a failure, so HELD is not a proof.
- **BROKE**: a monitor saw the rule fail. The trace that caused it is shown, and the reducer cuts it down to the smallest replay this reducer found.
- **COULDN'T TELL**: the rule cannot be checked with the signals, peripherals, or run length available. The verdict says why. This did not happen in any run below.

A 73 to 78 cycle overlap is 4.56 to 4.88 microseconds. That is brief, but the rule says WALK and DONT_WALK must never both be on. The rule has no minimum time, so any overlap is a violation.

## Results

Every HELD cell below reads the same: "No violation found in N emulated runs of this gremlin set. Not a proof." with the N shown in the note column.

### Round 2 (crossing), crosswalk-check

Rule: `all of (CAR_GREEN is 1, WALK is 1) must never happen.`

| Sketch | Verdict | Exit code | Try number | Note |
| --- | --- | --- | --- | --- |
| chatgpt-fast | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |
| chatgpt-high | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |
| claude-fast | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |
| claude-high | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |
| deepseek-fast | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |
| deepseek-high | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |
| gemini-fast | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |
| gemini-medium | HELD | 0 | none | No violation found in 24 emulated runs of this gremlin set. Not a proof. |

### Round 2 (crossing), crosswalk-full-check

Rule: `all of (WALK is 1, DONT_WALK is 1) must never happen.`

The overlap is the longest stretch where WALK and DONT_WALK were both 1, measured on the smallest replay this reducer found for try 1. Every reduced list went from 15 moves to 1.

| Sketch | Verdict | Exit code | Try number | Note |
| --- | --- | --- | --- | --- |
| chatgpt-fast | BROKE | 1 | 1 | Overlap 78 cycles (4.88 us). Fingerprint d6e86c6d8619b907. |
| chatgpt-high | BROKE | 1 | 1 | Overlap 78 cycles (4.88 us). Fingerprint a535ab6ae6984890. |
| claude-fast | BROKE | 1 | 1 | Overlap 78 cycles (4.88 us). Fingerprint b171d7dfc441e8b6. |
| claude-high | BROKE | 1 | 1 | Overlap 77 cycles (4.81 us). Fingerprint 9fa624d83c9d5b33. |
| deepseek-fast | BROKE | 1 | 1 | Overlap 78 cycles (4.88 us). Fingerprint 121116bae141fef2. |
| deepseek-high | BROKE | 1 | 1 | Overlap 73 cycles (4.56 us). Fingerprint 3ebac69b26f4addb. |
| gemini-fast | BROKE | 1 | 1 | Overlap 78 cycles (4.88 us). Fingerprint bcbc2d7d6aa3d9a2. |
| gemini-medium | BROKE | 1 | 1 | Overlap 78 cycles (4.88 us). Fingerprint eb807b1b943786a0. |

### Round 3 (motor), motor-check

Rules:

- `all of (FORWARD is 1, REVERSE is 1) must never happen.`
- `Within 50 ms after STOP_BUTTON is 0 becomes true, FORWARD is 0 must be true.`
- `Within 50 ms after STOP_BUTTON is 0 becomes true, REVERSE is 0 must be true.`

The FORWARD and REVERSE overlap was measured across all 200 tries for every sketch. It was 0 cycles (0.00 us) each time: no overlap found in those tries.

| Sketch | Verdict | Exit code | Try number | Note |
| --- | --- | --- | --- | --- |
| chatgpt-fast | BROKE | 1 | 159 | Rule: `Within 50 ms after STOP_BUTTON is 0 becomes true, FORWARD is 0 must be true.` Failed at cycle 5446730. Reduced from 18 moves to 3 (the smallest replay this reducer found). Fingerprint 59f29aa1c74f2e8a. STOP_BUTTON was low for 11337 cycles (0.71 ms), worked out from the reduced list. |
| chatgpt-high | HELD | 0 | none | No violation found in 200 emulated runs of this gremlin set. Not a proof. |
| claude-fast | HELD | 0 | none | No violation found in 200 emulated runs of this gremlin set. Not a proof. |
| claude-high | HELD | 0 | none | No violation found in 200 emulated runs of this gremlin set. Not a proof. |
| deepseek-fast | HELD | 0 | none | No violation found in 200 emulated runs of this gremlin set. Not a proof. |
| deepseek-high | HELD | 0 | none | No violation found in 200 emulated runs of this gremlin set. Not a proof. |
| gemini-fast | HELD | 0 | none | No violation found in 200 emulated runs of this gremlin set. Not a proof. |
| gemini-medium | HELD | 0 | none | No violation found in 200 emulated runs of this gremlin set. Not a proof. |

### Why `chatgpt-fast` missed the short STOP press

From reading the code: in `round3/chatgpt-fast.ino` (lines 29 to 38), when a direction button is held the loop clears one output, calls `delay(10)`, then sets the other. So each pass through `loop()` can spend 10 ms before it reads STOP again. This is an explanation from reading the code. It was not measured.

## What this does and does not show

Tests are evidence, not proof. Every result above comes from seed 20261101 and the gremlin set named in its table. A HELD row means these gremlins did not break the sketch in these runs. It says nothing about other seeds, other gremlins, or a real board wired to real parts. A BROKE row shows a rule failing on the emulated ATmega328P, with a replay you can run again.
