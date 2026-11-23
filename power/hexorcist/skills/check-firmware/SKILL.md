---
name: check-firmware
description: Check an ATmega328P program with Hexorcist's gremlins and fix it until the check says HELD
---

# Check firmware with Hexorcist

Hexorcist runs the compiled program on an emulated ATmega328P at 16 MHz, presses its inputs at awkward
moments with seeded scripted gremlins, and checks plain-sentence rules. The checker is deterministic: the
same program and settings always give the same answer. There is no AI in the checker.

## Step 1: Know the rule forms
Call the `capabilities` tool. Rules must use one of its five sentence forms, with the pin names from the
pin map, for example `Within 50 ms after STOP is 0 becomes true, MOTOR is 0 must be true.`

## Step 2: Build the program
The check needs a plain `.hex` for an ATmega328P at 16 MHz (not the one with a bootloader). In this
repository the demo builds with `node exorcism-demo/build.mjs`.

## Step 3: Run the check
Call the `check` tool with `hex`, `pins` and `rules` (paths relative to the repository root), or with
`example`. Optional: `gremlins`, `runs`, `seed`, `runMs`. The same check runs from a terminal with
`npm run check`.

## Step 4: Read the answer
- **BROKE**: a rule broke. Read `violation.rule` and `reducedList`: the smallest replay this reducer found,
  as timed input moves. Change the program so the rule holds for those moves, build, and check again with
  the same seed.
- **HELD**: report the `text` field word for word ("No violation found in N emulated runs of this gremlin
  set. Not a proof."). Do not say the program is correct, proven or bug-free.
- **COULDN'T TELL**: the program uses a part the emulator does not model (named in `reason`). Say so. Do
  not report a pass.

## Words to avoid about the result
Never call a program safe, secure, guaranteed, certified, real-time or bug-free because of a check.
