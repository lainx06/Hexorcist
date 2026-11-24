# Judge tour: five minutes

Everything below runs in a browser, with no sign-up and no install, except step 5, which is optional.

## 1. Break a program (1 minute)

Open **https://lainx06.github.io/Hexorcist/**. **Crosswalk** is already selected, with its rule: *cars and
walkers must never get a green at the same time.* Press **Unleash gremlins**.

What you should see: **BROKE** on try 4 of 24. Hexorcist cuts the Masher's 8 moves down to the 3 that matter
(press, let go, press and hold) and replays them, slowed down so you can watch the car and the walker both get
a green.

## 2. See the fix hold (30 seconds)

Press **See the fix work**. The same 3 moves play on the original and the fixed program side by side: the
original breaks, the fixed one holds. Then the fixed program runs all 24 tries live, and the card says *"No violation found in 24 emulated runs of this
gremlin set. Not a proof."*

## 3. See it refuse to guess (30 seconds)

Reload the page, pick **Your own program**, press **Try one it can't check**, then **Unleash
gremlins**. The program uses the serial port, which the emulator does not model, so the answer is
**COULDN'T TELL**, with the reason. No result is better than a wrong one.

## 4. Real chat-written firmware (1 minute)

[exorcism-demo/benchmark/README.md](../exorcism-demo/benchmark/README.md): four chat AIs, on fast and on high
thinking, wrote the same pedestrian crossing from one brief. Against seven rules from that brief, all eight
sketches broke the same one: WALK comes on about 5 microseconds before DON'T WALK goes off. Then Kiro, with
the Hexorcist power, took one sketch from BROKE to HELD in 45 seconds for 0.58 credits
([how](HOW-KIRO-BUILT-THIS.md#the-exorcism-loop-nov-23-2026)).

## 5. The same check outside the browser (optional, 2 minutes)

```bash
git clone https://github.com/lainx06/Hexorcist && cd Hexorcist && npm ci
npm run check -- --example crosswalk            # BROKE, exit code 1, fingerprint 47078989121ebc1d
npm run check -- --example crosswalk --fixed    # HELD, exit code 0
```

The same check runs as a GitHub Action (see the [`gate-demo` workflow runs](https://github.com/lainx06/Hexorcist/actions/workflows/gate-demo.yml): the fixed Crosswalk passes, the
buggy one fails the job) and as an MCP server inside Kiro.

## What to look at in the repository

| Question | Where |
|---|---|
| How was Kiro used? | [docs/HOW-KIRO-BUILT-THIS.md](HOW-KIRO-BUILT-THIS.md) and [`.kiro/`](../.kiro/): 14 specs, 5 steering files, 5 hooks on 4 triggers, a custom agent |
| Is the checker deterministic? | [`.kiro/steering/determinism.md`](../.kiro/steering/determinism.md); the same inputs give the same fingerprint in the browser, the terminal, CI and MCP |
| How often does it cry wolf? | [docs/evidence/EVIDENCE-NUMBERS.md](evidence/EVIDENCE-NUMBERS.md): fixed builds HELD in 300 of 300 seeded campaigns, buggy builds BROKE in 298 of 300 |
| What can't it do? | The **Limits** section of the [README](../README.md#limits) |
| Who wrote what? | README, "How the work was split": Kiro wrote the web app and the engine; Claude wrote the follow-up code after Kiro's credit limit, listed file by file |
