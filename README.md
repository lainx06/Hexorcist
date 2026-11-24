# Hexorcist

**AI wrote your gadget's code. Let gremlins break it here, before it breaks for real.**

Hexorcist runs a real compiled ATmega328P program on a simulated chip inside your browser. You write a rule in plain sentences, pick some gremlins (small scripted pests, not AI) and let them poke the program's inputs at awkward moments. If the rule breaks, Hexorcist cuts the attack down to the few moves that matter and replays them, step by step.

- **Live app:** https://lainx06.github.io/Hexorcist/
- **Demo video (under 3 minutes):** _link added at submission_
- Kiroween 2026 entry, Frankenstein category.

## Three answers, nothing else

| Verdict | What it means |
|---|---|
| **BROKE** | A rule was broken. You always see the replay that did it. |
| **HELD** | "No violation found in N emulated runs of this gremlin set. Not a proof." |
| **COULDN'T TELL** | The rule can't be checked with what's available (a part of the chip that isn't modelled, an unmapped signal, a rule that never triggered). Hexorcist says why instead of guessing. |

The checker is deterministic: time is counted in CPU cycles, the gremlins come from a seeded random number generator, and there is no AI and no network in the verdict. The same seed always gives the same result.

## Try it in 60 seconds

1. Open the live app. **Crosswalk** is already selected, with its rule: *cars and walkers must never get a green at the same time.*
2. Press **Unleash gremlins**.
3. Watch the Masher gremlin press the walk button. The program breaks the rule on try 4 of 24, and Hexorcist shrinks 8 moves down to the 3 that matter.
4. Press **See the fix work**. The same 3 moves play on the original and the fixed program side by side: the original breaks, the fixed one holds.
5. Try **Garage door** and **I'm-alive light**, or open **Your own program** and press **Try the sample**.

## How it works

```
compiled .hex  ->  emulated ATmega328P (avr8js, in a Web Worker)
                       ^                      |
     seeded gremlins move the inputs     outputs, cycle by cycle
                                              v
                                   rule monitors -> verdict
                                              |
                                  BROKE: shrink the moves (delta debugging)
                                              v
                                  replay: scene, move strip, signals
```

- **Emulator:** [avr8js](https://github.com/wokwi/avr8js) runs the program's machine code. Hexorcist wraps it in a bridge that models digital pins (ports B, C, D), timers 0 to 2 and pull-up resistors, and reports any part of the chip it doesn't model.
- **Rules:** five sentence forms, for example `Within 20 ms after BEAM_CLEAR is 0 becomes true, MOTOR_CLOSE is 0 must be true.` Each rule compiles to a monitor that watches the outputs cycle by cycle.
- **Gremlins:** Masher (presses a button over and over), Bouncer (a loose-wire flicker), Stuck (holds a button down), Dropout, Spike and Drifter (the last three need other kinds of input).
- **Shrinking:** when a try breaks a rule, a reducer removes moves until no single move can be taken away without the replay passing. It shows "the smallest replay this reducer found", checked by replaying on a fresh emulator.
- **Scenes:** the crosswalk, garage and I'm-alive scenes are drawings driven only by the program's real outputs, and each is labelled "Illustrative". Your own program gets a "Pin levels" view that shows the real pin levels only.

## Use it on your own program

1. Compile your sketch for an **ATmega328P at 16 MHz** (for example a board built on that chip, such as an Arduino Uno) and export the compiled binary. With `arduino-cli`: `arduino-cli compile -b arduino:avr:uno --output-dir build your_sketch`. Use the plain `.hex`, not the one "with bootloader".
2. In Hexorcist, choose **Your own program**, then **Choose .hex file**. The file is read in your browser tab and is never uploaded anywhere.
3. Fill in the pin table: the signal names your rule will use, the port and bit of each pin, input or output, and the pressed level for inputs. You can import and export the table as JSON.
4. Write a rule (templates are offered for your signal names), pick gremlins and unleash.

Other clock speeds give wrong timings. Programs that use the serial port, SPI, the two-wire bus, EEPROM, the watchdog or analog inputs get COULDN'T TELL, with the part named.

## Headless runner

The same check runs from a terminal, a GitHub Action, an MCP client and two Kiro hooks. All of them call the same worker functions as the page, so the verdict, the try number, the reduced move list and the fingerprint match what the page shows.

### Command line

```
npm run check -- --example crosswalk
npm run check -- --example crosswalk --fixed --json
npm run check -- --hex build/my.hex --pins pins.json --rules rules.txt --gremlins masher,bouncer --runs 24 --seed 20261101 --run-ms 1000
```

- `--example <crosswalk|garage|heartbeat>` loads a bundled example (add `--fixed` for its fixed build).
- `--hex`, `--pins` and `--rules` load your own files. Relative paths resolve against the folder you ran the command in. Do not mix them with `--example`.
- `--gremlins` (comma-separated ids), `--runs`, `--seed` and `--run-ms` are optional. Left out, they come from the example's `meta.json`, or from the defaults the page uses for an uploaded program.
- `--json` prints exactly one JSON object and nothing else on stdout. The same inputs give the same bytes on Windows, macOS and Linux. It holds no timestamp, path or duration.

| Exit code | Meaning |
|---|---|
| 0 | HELD |
| 1 | BROKE (the trace that did it is printed) |
| 2 | COULDN'T TELL (the reason is printed) |
| 3 | Bad input or an internal error. A reason goes to stderr and no verdict is printed. |

For COULDN'T TELL, the JSON has `reason` and then `reasonTruncated`: true when the reason reached the 200-character limit, so it may have been cut.

### GitHub Action

`action.yml` at the repo root is a composite action named `hexorcist-gate`.

- Required inputs: `hex`, `pins`, `rules`. Optional inputs: `gremlins`, `runs`, `seed`.
- Outputs: `verdict` and `exit-code`, set before the step that fails the job, so a later step can read them.
- The job fails on exit code 1, 2 or 3 and passes on 0. A Markdown summary with the verdict, exit code, seed and runs goes to the job summary.
- `.github/workflows/gate-demo.yml` runs it on the crosswalk fixed build (passes) and the buggy build (the run goes green when the gate catches it).

### MCP server

`npm run mcp` starts a stdio JSON-RPC server with two tools: `check` (same inputs as the CLI, same JSON back) and `capabilities` (the five rule sentence forms, the gremlin ids and the parts of the chip that are not modelled). It makes no network call.

### Kiro hooks

Two existing hook files run commands from `cli/`:

- `hexorcist-check-on-stop` runs `cli/hook-stop.ts` when the agent stops. It builds the demo sketch, checks it, and records the verdict in `.hexorcist/last-verdict.json`. With `--block`, a BROKE or COULDN'T TELL verdict sends the agent back to work, up to 3 times in a row.
- `hexorcist-done-guard` runs `cli/hook-guard.ts` before a spec task is marked done. It blocks the call unless the recorded verdict is HELD for the current `.hex` file.

The demo loop lives in `exorcism-demo/`: `sketch/sketch.ino`, `build.mjs` (needs `arduino-cli`), `crosswalk-full-rules.txt` and `loop-check.json`. Both hooks are enabled from Kiro's hook panel.

### Kiro power

`power/hexorcist` is a power with the MCP server and a skill that tells an agent how to use it. Set the `HEXORCIST_ROOT` environment variable once, to this repo's folder. Details and the launcher log location are in [power/hexorcist/README.md](power/hexorcist/README.md).

## Evidence

Measured with `npm run bench:evidence` on Nov 16, 2026 (Windows, AMD Ryzen 7 7800X3D, Node 26). These are results of emulated runs, not a proof. Full table: [docs/evidence/EVIDENCE-NUMBERS.md](docs/evidence/EVIDENCE-NUMBERS.md).

| Example | Buggy build, seeds 1 to 100 | Fixed build, seeds 1 to 20 |
|---|---|---|
| Crosswalk | BROKE 99, HELD 1 | HELD 20 |
| Garage door | BROKE 100 | HELD 20 |
| I'm-alive light | BROKE 99, HELD 1 | HELD 20 |

A single ordinary button press, moved every 10 ms across the whole run, broke none of the six builds. It takes the gremlins' awkward timing to find these bugs.

In Chrome on the same desktop, the emulator ran at about 72 to 80 million chip cycles per second. The app shows the figure measured on your own computer in the Details tab.

## How Kiro built this

Kiro wrote all of the product code and tests in this repository. Everything Kiro used is committed in [`.kiro/`](.kiro/):

- **13 specs** in [`.kiro/specs/`](.kiro/specs/): 11 features (emulator bridge, bridge output scan, gremlin engine, rule compiler, trace reducer, example firmware, honest verdicts, three UI stages and the upload path) and 2 bugfix specs. The `input-pullup` bugfix came from a real emulator issue found on day one: an unconnected button with a pull-up resistor read as pressed.
- **Property-based tests** with fast-check throughout. They caught real bugs, including one in how a scene drew fast flickers.
- **Steering** ([`.kiro/steering/`](.kiro/steering/)): determinism rules, the exact verdict texts, scope, test rules and the banned claim words.
- **Hooks** ([`.kiro/hooks/`](.kiro/hooks/)):
  - `guard-before-task` runs before every spec task and blocks the task if copy uses a claim word or engine code reads the clock. It blocked a real task once, when a design doc listed the banned words. (The copy-scan tests caught Kiro itself writing one in a code comment.)
  - `engine-tests-on-save` and `examples-on-save` run the tests whenever Kiro edits engine code or an example sketch; the second one recompiles the sketches before testing.
- **Custom agent** [`rule-skeptic`](.kiro/agents/rule-skeptic.md): read-only, it argues with a rule before you run it (unmapped signals, triggers that can't happen, limits longer than the run) and opens every answer with "Advice, not a verdict."
- **CI** runs the type check, the guard, every test and the build on each push.

How the work was split: Kiro wrote the code. The author directed the project, approved every change and ran the browser checks. Claude acted as the planning lead (spec prompts, review triage, acceptance checks, the hook, agent and workflow files, and this README). ChatGPT and Gemini gave outside design reviews.

## Limits

- One chip: the ATmega328P at 16 MHz. Digital pins, timers 0 to 2 and pull-ups are modelled; the parts listed above are not.
- The analog input path is unit-tested only, and uploads don't accept analog pins yet.
- HELD means no violation in the runs that were made. It is not a proof that the program is correct.
- A rule's time limit that is still running when a try ends is not judged.
- Gremlins are scripted and seeded; they explore awkward input timing, not every possible input.
- Nothing is compiled in the browser; you bring a compiled `.hex`.

## Develop

```
npm ci
npm run dev           # the app at http://localhost:5173
npx vitest --run      # all tests
npm run typecheck
npm run guard         # claim words, clock use, brand names
npm run build
npm run examples:build   # recompile the example sketches (needs arduino-cli)
npm run bench:evidence   # regenerate docs/evidence/EVIDENCE-NUMBERS.md
```

## Licence

MIT, see [LICENSE](LICENSE). Third-party: avr8js (MIT). Dev tools: Vite (MIT), Vitest (MIT), fast-check (MIT), TypeScript (Apache-2.0), tsx (MIT). Prior ideas and re-implemented algorithms are listed in [PRIOR_WORK.md](PRIOR_WORK.md).
