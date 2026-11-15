# Evidence numbers

These numbers come from emulated runs of the ATmega328P example programs. They are evidence, not a proof.

Rerun them with `npm run bench:evidence`. The bench reads the wall clock only for the date and the times in this file.

## Machine and run

| Item | Value |
|---|---|
| OS | Windows_NT 10.0.26200 (x64) |
| CPU | AMD Ryzen 7 7800X3D 8-Core Processor, 16 cores |
| Node | v26.13.1 |
| avr8js | 0.21.1 |
| Date of run (UTC) | 2026-11-15 |
| Seed ranges | campaignSeed 1 to 100 for buggy builds, 1 to 20 for fixed builds |
| Wall-clock time | seed sweep 635.8 s, single-press sweep 97.1 s, whole bench 732.9 s |

## Seed sweep

One Campaign per seed. Each Campaign uses the committed HEX, `fixture.json`, `rules.txt`, `gremlinSet`, `runs` and `runCycles` of the example; only `campaignSeed` changes. The violating run number is the 1-based index of the Run that broke the rule.

| Example | Build | Seeds | Runs per Campaign | BROKE | HELD | COULDN'T TELL | Violating run number (min / median / max) |
|---|---|---|---|---|---|---|---|
| crosswalk | buggy | 1 to 100 | 24 | 99 | 1 | 0 | 1 / 3 / 16 |
| crosswalk | fixed | 1 to 20 | 24 | 0 | 20 | 0 | not measured |
| garage | buggy | 1 to 100 | 40 | 100 | 0 | 0 | 1 / 6 / 38 |
| garage | fixed | 1 to 20 | 40 | 0 | 20 | 0 | not measured |
| heartbeat | buggy | 1 to 100 | 24 | 99 | 1 | 0 | 1 / 4 / 17 |
| heartbeat | fixed | 1 to 20 | 24 | 0 | 20 | 0 | not measured |

HELD texts seen:

- crosswalk buggy: "No violation found in 24 emulated runs of this gremlin set. Not a proof."
- crosswalk fixed: "No violation found in 24 emulated runs of this gremlin set. Not a proof."
- garage fixed: "No violation found in 40 emulated runs of this gremlin set. Not a proof."
- heartbeat buggy: "No violation found in 24 emulated runs of this gremlin set. Not a proof."
- heartbeat fixed: "No violation found in 24 emulated runs of this gremlin set. Not a proof."

## Single-press sweep

One Run per start. Each Run holds only the rest events of the fixture and one ordinary press and release of the Single_Input from the example-firmware spec, moved to start every 10 ms (160,000 cycles) from 10 ms up to the last start whose release is still inside the run. No gremlin events. Each Run continues to `runCycles`.

| Example | Build | Signal | Hold (cycles) | Starts (cycles) | Start count | Runs with a violation | Runs with a CannotCheck |
|---|---|---|---|---|---|---|---|
| crosswalk | buggy | REQUEST | 800,000 | 160,000 to 15,040,000 | 94 | 0 | 0 |
| crosswalk | fixed | REQUEST | 800,000 | 160,000 to 15,040,000 | 94 | 0 | 0 |
| garage | buggy | BEAM_CLEAR | 32,000 | 160,000 to 9,920,000 | 62 | 0 | 0 |
| garage | fixed | BEAM_CLEAR | 32,000 | 160,000 to 9,920,000 | 62 | 0 | 0 |
| heartbeat | buggy | PULSE | 1,600,000 | 160,000 to 14,240,000 | 89 | 0 | 0 |
| heartbeat | fixed | PULSE | 1,600,000 | 160,000 to 14,240,000 | 89 | 0 | 0 |

No single-press Run had a violation.
