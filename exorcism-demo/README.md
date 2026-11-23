# Exorcism demo

A small device for the on-camera loop: Kiro writes the program, the hooks check it, and Kiro keeps
fixing it until the check says HELD. The check is the same deterministic one as `npm run check`
(seeded gremlins, CPU cycles, no AI in the checker).

## The device: a conveyor with a stop button

| Signal | Pin | Direction |
|---|---|---|
| STOP | PD2 | input, pressed = low (use the internal pull-up) |
| MOTOR | PB0 | output, 1 = running |
| LED | PB5 | output, status light that blinks while running |

Rule (`rules.txt`): `Within 50 ms after STOP is 0 becomes true, MOTOR is 0 must be true.`

Check settings (`check.json`): Masher, 24 tries, seed 20261101, 1000 ms per try.

## Files

| File | What |
|---|---|
| `sketch/sketch.ino` | The program. Written by Kiro during the demo; not in the repo until then. |
| `build.mjs` | Builds `sketch/sketch.ino` into `build/sketch.hex` (ATmega328P, 16 MHz). |
| `pins.json`, `rules.txt`, `check.json` | The device, the rule and the check settings. |
| `build/` | Build output, git-ignored. |

## The hooks

| Kiro trigger | Command | What it does |
|---|---|---|
| Agent Stop | `npx tsx --no-deprecation cli/hook-stop.ts exorcism-demo/check.json --block` | If the sketch changed: build, check, print one verdict line. Exit 2 on BROKE, COULDN'T TELL or a failed build; stops blocking after 3 tries in a row. |
| Pre Tool Use (matcher `spec`) | `npx tsx --no-deprecation cli/hook-guard.ts exorcism-demo/check.json` | Blocks marking a task done unless the last check of the current sketch was HELD. |

State lives in `.hexorcist/` (git-ignored): `last-verdict.json`, `stop-blocks.json`, and the last Pre Tool
Use payload in `last-pretooluse.json`.

UNVERIFIED until tried in Kiro: whether Kiro sends an Agent Stop hook's exit-2 output back to the agent, and
which Pre Tool Use payload marks a spec task done (the guard looks for a status field set to completed or done).

## Tested without Kiro

`tests/cli/hooks.test.ts` runs both hooks on two plain C versions of this device in `tests/cli/conveyor/`:
the one that reads STOP once every 200 ms gives BROKE (one Masher press is enough), the one that reads it
every 1 ms gives HELD in 24 tries. These test programs were written by Claude, not Kiro.
