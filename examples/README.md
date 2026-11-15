# Hexorcist examples

Three small ATmega328P programs at 16 MHz, each written twice: `buggy/` has one planted bug and
`fixed/` has the same program with that bug removed. Each folder also has the pin map
(`fixture.json`), the rules (`rules.txt`, written in Hexorcist's five fixed English sentence
patterns) and the campaign settings (`meta.json`).

| Example | What goes wrong in the buggy build |
|---|---|
| crosswalk | Two quick presses can leave WALK on while the cars get green. |
| garage | Two short beam breaks in quick succession are taken as noise, so the door keeps closing. |
| heartbeat | A stuck pulse input stops the HEARTBEAT output from toggling. |

## Results at the committed seeds

| Example | Gremlins | Buggy build | Fixed build |
|---|---|---|---|
| crosswalk | masher | BROKE (run index 3, seed 20261101) | HELD: no violation found in 24 runs of this gremlin set, not a proof |
| garage | bouncer, masher | BROKE (run index 7, seed 20261102) | HELD: no violation found in 40 runs of this gremlin set, not a proof |
| heartbeat | stuck | BROKE (run index 1, seed 20261103) | HELD: no violation found in 24 runs of this gremlin set, not a proof |

In the tests, one ordinary input on its own (a single press, beam break or pulse) does not break
any buggy build. The bugs need the gremlins' timing.

## Demo timings

Timings are shorter than on a real device, so each campaign run lasts at most one second of
simulated time. Each `meta.json` has a `timingNote` that says where:

- crosswalk: Demo timing: yellow 150 ms, all-red 50 ms, WALK 200 ms (a real crossing takes many seconds).
- garage: Demo timing: the door closes by itself after 300 ms open and takes 300 ms to close (a real door waits and moves for several seconds).
- heartbeat: Demo timing: HEARTBEAT toggles every 200 ms and a pulse wait gives up after 100 ms (a real monitor beats about once a second).

## Glitch-tolerant rules

A `must never happen.` rule breaks if its condition is true for even one CPU cycle. If a short
glitch should not count, write the glitch-tolerant form instead:

    <C> must never last 1 ms or longer.

## Rebuilding the HEX files

Run `npm run examples:build`. It compiles each sketch, keeps only `<variant>.hex` next to the
sketch and deletes the `build/` folder. The tests read the committed HEX files and never compile.

A passing test is evidence, not proof.
