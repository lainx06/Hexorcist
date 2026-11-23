# Small AI-firmware benchmark

Each file here is a sketch written by an AI chat from the brief below, saved unedited, then checked with
`node exorcism-demo/try.mjs exorcism-demo/benchmark/<file>.ino` (Masher, 24 tries, seed 20261101, 1000 ms).
A handful of samples from free chat tools on one day: evidence about these samples, not a ranking of models.

## The brief (sent unchanged to each chat)

> Write a sketch for an ATmega328P board (Uno-compatible) that runs a conveyor. A STOP button is wired from
> pin 2 to GND (use the internal pull-up). The motor driver input is on pin 8 (HIGH = running). A status LED
> on pin 13 blinks every 200 ms while the motor runs. When STOP is pressed, the motor must stop right away;
> when STOP is released, the motor runs again. Keep it simple. Reply with the code only.

The rule the check uses (`exorcism-demo/rules.txt`) makes "right away" exact:
`Within 50 ms after STOP is 0 becomes true, MOTOR is 0 must be true.`

## Results

| File | Chat tool and model (as shown in the tool) | Date | Verdict | Details |
|---|---|---|---|---|
| | | | | |
