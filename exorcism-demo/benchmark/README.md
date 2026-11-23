# Small AI-firmware benchmark

Each file here is a sketch written by an AI chat from a fixed brief, saved unedited, then checked with
`node exorcism-demo/try.mjs <file> [config]` (Masher, 24 tries, seed 20261101, 1000 ms per try).
A handful of samples from chat tools on one day: evidence about these samples, not a ranking of models.
Model names are as the chat tool showed them.

## Round 1: conveyor (Nov 23, 2026)

Brief (sent unchanged):

> Write a sketch for an ATmega328P board (Uno-compatible) that runs a conveyor. A STOP button is wired from
> pin 2 to GND (use the internal pull-up). The motor driver input is on pin 8 (HIGH = running). A status LED
> on pin 13 blinks every 200 ms while the motor runs. When STOP is pressed, the motor must stop right away;
> when STOP is released, the motor runs again. Keep it simple. Reply with the code only.

Rule (`exorcism-demo/rules.txt`): `Within 50 ms after STOP is 0 becomes true, MOTOR is 0 must be true.`
Check: `node exorcism-demo/try.mjs exorcism-demo/benchmark/<file>.ino`

| File | Chat tool, model and setting | Verdict |
|---|---|---|
| `chatgpt.ino` | ChatGPT (incognito), GPT-6, high thinking | HELD (24 tries) |
| `claude.ino` | claude.ai (incognito), Opus 5.5, high effort | HELD (24 tries) |
| `gemini.ino` | Gemini, "4 Hydrogen", medium thinking | HELD (24 tries) |
| `deepseek.ino` | DeepSeek, DeepThink on (model name not shown) | HELD (24 tries) |

All four sketches held for this simple brief. HELD means no violation in these 24 tries, not a proof.

## Round 2: pedestrian crossing

Brief (sent unchanged):

> Write a sketch for an ATmega328P board (Uno-compatible) for a pedestrian crossing. A REQUEST button is
> wired from pin 2 to GND (use the internal pull-up). Car lights: green on pin 8, yellow on pin 9, red on
> pin 10. Pedestrian lights: WALK on pin 11, DON'T WALK on pin 12. Cars have green until someone presses
> REQUEST. Then: yellow for 150 ms, all red for 50 ms, WALK for 200 ms, all red for 50 ms, then cars get
> green again. The button can be pressed at any time, including during a crossing. Don't use blocking
> delays. Keep it simple. Reply with the code only.

Rule (`examples/crosswalk/rules.txt`): `all of (CAR_GREEN is 1, WALK is 1) must never happen.`
Check: `node exorcism-demo/try.mjs exorcism-demo/benchmark/round2/<file>.ino exorcism-demo/crosswalk-check.json`

Results (Nov 23, 2026), Masher, 24 tries, seed 20261101:

| File | Chat tool, model and setting | Verdict |
|---|---|---|
| `chatgpt-fast.ino` | ChatGPT, fast setting | HELD (24 tries) |
| `chatgpt-high.ino` | ChatGPT, high thinking | HELD (24 tries) |
| `gemini-fast.ino` | Gemini, fast setting | HELD (24 tries) |
| `gemini-medium.ino` | Gemini, medium thinking | HELD (24 tries) |
| `deepseek-fast.ino` | DeepSeek, DeepThink off | HELD (24 tries) |
| `deepseek-high.ino` | DeepSeek, DeepThink on | HELD (24 tries) |
| `claude-fast.ino` | claude.ai, Haiku 5.5, medium effort | HELD (24 tries) |
| `claude-high.ino` | claude.ai, Opus 5.5, high effort | HELD (24 tries) |

A first run of these files was checked against the conveyor rule by mistake (an old `try.mjs` that ignored
the config argument); those results are discarded.

## Round 2 stress check

The same eight files with two gremlins (Masher and Bouncer, the contact-bounce gremlin) and 200 tries:
`node exorcism-demo/try.mjs <file> exorcism-demo/crosswalk-stress-check.json`

All eight: **HELD (200 tries)**.

## Round 2, full rules from the brief

One rule checks one thing. These seven rules restate the brief (`exorcism-demo/crosswalk-full-rules.txt`):

```
all of (CAR_GREEN is 1, WALK is 1) must never happen.
all of (WALK is 1, DONT_WALK is 1) must never happen.
all of (CAR_GREEN is 1, CAR_YELLOW is 1) must never happen.
all of (CAR_GREEN is 1, CAR_RED is 1) must never happen.
all of (CAR_YELLOW is 1, CAR_RED is 1) must never happen.
CAR_YELLOW is 1 must never last 200 ms or longer.
WALK is 1 must never last 250 ms or longer.
```

The two timing rules give the brief's 150 ms yellow and 200 ms WALK 50 ms of slack. The WALK rule is a
reading of the brief: a sketch that restarts WALK when the button is pressed during WALK would break it.
Calibration: the Crosswalk example's fixed build holds all seven (Masher + Bouncer, 200 tries, seed
20261101); its buggy build breaks the first rule on try 4.

Check: `node exorcism-demo/try.mjs <file> exorcism-demo/crosswalk-full-check.json`

| File | Verdict | Both-on time (`measure-round2.mjs`) |
|---|---|---|
| `chatgpt-fast.ino` | BROKE, try 1 of 200 | 78 cycles, 4.88 µs at 970.8 ms |
| `chatgpt-high.ino` | BROKE, try 1 of 200 | 78 cycles, 4.88 µs at 990.3 ms |
| `claude-fast.ino` | BROKE, try 1 of 200 | 78 cycles, 4.88 µs at 990.3 ms |
| `claude-high.ino` | BROKE, try 1 of 200 | 77 cycles, 4.81 µs at 990.3 ms |
| `deepseek-fast.ino` | BROKE, try 1 of 200 | 78 cycles, 4.88 µs at 970.8 ms |
| `deepseek-high.ino` | BROKE, try 1 of 200 | 73 cycles, 4.56 µs at 970.8 ms |
| `gemini-fast.ino` | BROKE, try 1 of 200 | 78 cycles, 4.88 µs at 970.8 ms |
| `gemini-medium.ino` | BROKE, try 1 of 200 | 78 cycles, 4.88 µs at 970.8 ms |

All eight broke the same rule, `all of (WALK is 1, DONT_WALK is 1) must never happen.`, and the reducer cut
each replay to one ordinary press of REQUEST (at 770.5 ms). Reading the code explains it: every sketch sets
the lights in a helper that writes WALK and then DON'T WALK, one `digitalWrite` after the other. When WALK
comes on, both pedestrian lights are on for about 5 microseconds (one `digitalWrite`) before DON'T WALK goes
off. The sketches that break at 990.3 ms add a 20 ms debounce before reacting to the press.

What this means: this is a real, repeatable behaviour of the code, measured in CPU cycles, not a checker
error. On lamps nobody would see it. The same write order on two outputs that must never be on together
(for example the two sides of a motor driver) is the pattern behind a short circuit. The rule decides which
you care about: `must never happen` catches it; `must never last 1 ms or longer` accepts it (checked on a
replica of the same write order). The fix is to switch lights off before switching others on, as the
Crosswalk example's fixed build does.

## The Exorcism Loop on `chatgpt-high.ino`

Kiro (Vibe mode, model Auto, with the hexorcist power) got `chatgpt-high.ino` as
`exorcism-demo/sketch/sketch.ino`, the seven rules, Masher + Bouncer, 24 tries, seed 20261101:

1. BROKE: `all of (WALK is 1, DONT_WALK is 1) must never happen.` Kiro swapped the two writes.
2. BROKE: `all of (CAR_GREEN is 1, CAR_RED is 1) must never happen.` (car green on before red off at the end
   of the crossing). Kiro changed the light helper to switch each light off before the next one on.
3. HELD. 45 seconds, 0.58 credits.

Independent check of Kiro's result (`round2/chatgpt-high-kiro-fixed.ino`): HELD in 200 tries with Masher +
Bouncer and all seven rules; `overlap.ts` shows WALK and DON'T WALK never on together.

## Summary

| Round | Sketches | Rules and gremlins | Result |
|---|---|---|---|
| 1 conveyor | 4 | 1 rule; Masher, 24 tries | 4 HELD |
| 2 crossing | 8 | 1 rule; Masher, 24 tries | 8 HELD |
| 2 crossing, stress | 8 | 1 rule; Masher + Bouncer, 200 tries | 8 HELD |
| 2 crossing, full rules | 8 | 7 rules from the brief; Masher + Bouncer, 200 tries | 8 BROKE, all on the same ~5 µs WALK + DON'T WALK overlap |

HELD means no violation in the runs made, not a proof.
