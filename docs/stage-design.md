# Stage design (bench-ui-stage target)

**Source:** the Lead's mockup v2 (7 artboards; screenshots in `docs/mockup/01.png` to `07.png`) and review triage decisions D40–D61 (Nov 16, 2026).

The screenshots show the **target**. This file is the **contract**. Where they differ, this file wins. The mockup has known clipping and crowding; the build must not.

## 0. Non-negotiables (from the project rules)

- **Three verdicts only:** BROKE, HELD and COULDN'T TELL. The HELD sentence is always computeVerdict's exact text. Plain sentences may be added around a verdict; they never replace it.
- **No banned word in UI copy:** safe, safety, secure, guaranteed, certified, real-time, first (also as an ordinal), unique, shortest. No board-maker brand names.
- **Scenes are illustrative** and driven only by replay output edges and recorded input events. Each scene carries an "Illustrative" badge. Nothing living is ever drawn being hit, touched or crushed. The car never moves while the walker is on the crossing, in any view, at any cursor position or speed.
- **Never change event times, lengths or values for display.** The player changes only speed and position, and any speed other than 1x shows a badge.
- **Every number shown is computed from the current run:** elapsed time, cycles per second, counts, try numbers. Nothing is hard-coded.
- **Gremlins are scripted, not AI.** Say so in the hero, the setup and on phone width.
- **No engine changes and no new packages.** Fonts are the system stacks: `system-ui, "Segoe UI", sans-serif` for text and `ui-monospace, Consolas, monospace` for times and code only.

## 1. Look

**Colours (dark theme):**

| Token | Hex | Use |
|---|---|---|
| bg | #0C1110 | page background |
| surface-1 | #101715 | stage background |
| surface-2 | #121917 | panels |
| surface-3 | #151E1C | cards and fields |
| line | #22302C | borders |
| line-strong | #3A4A45 | secondary button borders |
| text | #E7EEEB | body text |
| text-2 | #C9D6D1 | secondary text |
| muted | #A9BAB4 | muted text (at least 4.5:1 on surface-2) |
| mint | #7EE2A8 | on / held / primary button |
| pumpkin | #F2A541 | gremlins only |
| pumpkin-soft | #F7D9A8 | gremlin text |
| coral | #FF7A6B | broke / conflict |
| broke-surface | #1C1513 | BROKE card background (border #5A2E28) |
| held-surface | #121D19 | HELD card background (border #2D5A43) |
| couldnt-tell-surface | #17181C | COULDN'T TELL card background (border #3E4352) |

**Shape:** radius 10–18 px. Spacing scale 4, 8, 12, 16, 20, 28 px. Touch targets at least 44 px. Visible focus rings.

**Type:** h1 46 px / 1.08 / 700 (26 px on phones); verdict word 32 px; body 15–17 px; meta 13 px (never below 12 px). Dashed borders mean **disabled** only.

**Layout rules:**
- No text overlaps any other text, shape or scene element.
- Labels outside a scene go in HTML, not SVG.
- Scenes scale to their container (`width: 100%`, `height: auto`).
- No clipping at 1440, 1280, 1024, 768 or 375 px widths.

## 2. Page states

1. **On load** (mockup 01): header → hero → setup (expanded) → idle stage.
2. **Running:** the stage shows "Try N of M" and a slim progress bar. The setup stays expanded but is locked.
3. **Finding the moves** (mockup 03): the BROKE card appears at once; the stage shows the shrink view.
4. **Broke** (mockup 02): setup collapses to a summary bar; the stage shows the scene, the move strip and the player, with the BROKE aside; tabs below.
5. **Fix** (mockup 04): after "See the fix work", the stage becomes two scenes side by side on one shared cursor.
6. **COULDN'T TELL or HELD on the buggy run** (mockup 05): the verdict card is in the aside, with no shrink and no fix button.
7. **Phone** (mockup 07): one column, the same order, the setup summary on top.

## 3. Header and hero

- **Header:** a ghost-mark logo (inline SVG, mint stroke), the word "Hexorcist", and a "Technical details" switch whose visible state text reads "Off" or "On" (`role="switch"`, `aria-checked`). The existing localStorage persistence stays.
- **h1:** "AI wrote your gadget's code." then, on a new line in mint, "Let gremlins break it here, before it breaks for real."
- **Paragraph:** "Hexorcist runs the real compiled program on a simulated chip, right in this page. Gremlins (simple scripted pests, not AI) poke its buttons at awkward moments. If your rule breaks, you see the few moves that did it, replayed step by step."
- **Chips (plain, not buttons):** "Runs the real compiled program" · "Same gremlins, same result, every time" · "Runs in your browser".
- After a run, the hero shrinks to the header line with the tagline as small text (mockup 02).

## 4. Setup

**Expanded (on load):** numbered sections.

1. **"1 · PICK A DEVICE":** three device cards (buttons, `aria-pressed`) in a grid, each with a small original illustration, a title and one line:
   - Crosswalk: "Cars and walkers must never both see green."
   - Garage door: "Something in the doorway? The door must stop."
   - I'm-alive light: "A light that must keep blinking to show the program is running."
   - The selected card gets a 2 px pumpkin border.
   - **The 4th card "Your own program" is NOT built in this feature** (it comes with upload in H3). Leave a grid slot so adding it later doesn't reflow.
2. **"2 · RULE":**
   - the plain rule headline (existing EXAMPLE_COPY);
   - "Why it matters: …" (section 9);
   - a "Change rule ▾" menu with presets (section 8).
   - With technical details on, the exact sentence and the existing exact-text editor show.
3. **"3 · GREMLINS · scripted pests, not AI":**
   - compatible gremlins as chips (character icon plus name, `aria-pressed`, a check mark when selected);
   - incompatible ones hidden behind a link, "N more need other inputs", which opens them disabled with their plain reason.
4. **Primary button "Unleash gremlins"** (one primary button on the page), plus the line "<M> tries · <run length> of device time each". Run length is formatted "1 s" or "0.6 s". The tries and seed fields move to the Details tab (technical details on).

**Collapsed (after a run):** one bar reading "<Device> · <rule headline> · <gremlin names> · gremlins are scripted pests, not AI", with "Change setup ▾" (re-expands) and "Run again".

## 5. Stage

Two columns (scene area takes most of the width; the aside is about 300 px). On phones the aside goes below the scene.

**Idle:**
- The current device's scene dimmed at 60%.
- "Nothing has broken yet."
- "Press Unleash gremlins. If a rule breaks, the replay plays here."
- No empty timeline and no "waiting for a run" labels anywhere.

**Running:** "Try N of M" with a progress bar.

**Shrink view (mockup 03):**
- The dimmed scene with "Finding the moves that matter…" and "tried <n> shorter versions of the attack so far".
- Below it, the move strip with one dot per original move. Legend: needed / testing now / not needed.
- **The dots reflect only real reducer attempts.** Read what the reducer's progress callback actually provides:
  - If it reports which subset is being tried, dim those dots while the attempt runs.
  - If it reports only counts, show the counter, then the final collapse (unneeded dots fade and the rest slide together, 400 ms).
  - Report which case applies.
- The BROKE card is in the aside from the moment of the break, with a placeholder for the story.

**Broke (mockup 02):**
- **Scene.** The replay of the reduced list. It **auto-plays once**: from max(0, earliest move − 200 ms) to the break, then stops on the break frame. Not with reduced motion: then it shows the break frame. It is paced so that:
  - the whole segment lasts about 8 s;
  - inside any cluster of moves closer than 50 ms, the speed drops so each move is on screen for at least 400 ms.
  - The speed badge always shows the current factor: "Slowed N× so you can see it" (N rounded to a friendly number). At 1x it shows "Real speed".
  - Badges on the scene: "Both have a green!" (or the example's conflict badge) at top left, "Illustrative" at top right, and "Stopped at the break" at bottom right while frozen.
- **Move strip.** One dot per reduced move, placed by time. Labels show **relative time from the earliest move** ("+0 ms pressed", "+65 ms let go", …), in whole ms, with plain phrases. A coral ✕ marks the break ("+450 ms broke"). Each dot pulses for 150 ms when the cursor passes it.
- **Player** (under the strip): Play/Pause (44 px, labelled), "Replay", and a speed slider "Slower ←→ Real speed (1x)". The existing scrubber, previous/next event and preset speeds live in the **Signals** tab.
- **Aside:**
  - **BROKE card:** the word BROKE; the plain BROKE sentence (existing); a **cause line** (section 9); "Broke on try N of M · found in X s". X is the buggy campaign's elapsed time, rounded half-up to 0.1 s.
  - **Reduction card:**
    - "<original> moves → <reduced> needed";
    - if the reducer finished within its budget (it did not stop at the budget): "Take away any one of these K moves and this replay no longer breaks the rule." (K = 1: "Take away this move and this replay no longer breaks the rule.");
    - if it stopped at its budget: "Shrinking stopped at its limit; fewer moves may still break it."
  - **Primary button:** "See the fix work →".

**Fix (mockup 04):**
- Heading: "The same K moves, on both programs". Badge: "Same moves, same moment · slowed N×".
- Two scenes on one shared cursor and one player:
  - **Left, "Original program":** the reduced replay on the buggy build. It freezes at its break with a coral border, and its card reads "BROKE · Stopped at the break."
  - **Right, "Fixed program":** the same reduced list on the fixed build (the existing display replay). It keeps playing to the break time + 500 ms. Its badge is computed from that replay's outputs at the cursor (for example "Walk sign: off · Car light: green").
- Right card:
  - "Same K moves: no break." (or "Same K moves still break the fixed program.").
  - While the fixed campaign runs: "Checking the fixed program: try N of M".
  - When it finishes: "HELD · fixed program, all M tries:" followed by computeVerdict's exact text. Use the verdict's own label if it is not HELD.
- **"What the fix changed":** the plain fix explanation (section 9; you must check it against the buggy and fixed sources and report any mismatch), then "Show the code change ▾" (the collapsed diff, comment-only hunks hidden) and "Replay both".

**Phone:** scene, then the BROKE card with the cause line, the move list as rows, then "Replay" plus "See the fix work →", then the tabs.

## 6. Tabs (below the stage)

These are real tabs (`role="tablist"`, keyboard arrows), cross-fading in 150 ms:

- **What happened:**
  - the plain story;
  - a legend line per gremlin named, with the gremlin's icon: "<Name>: a gremlin that <plain text>".
- **Signals:**
  - the existing timeline, scrubber, previous/next event, "Jump to the break" and preset speeds;
  - lane labels use friendly names;
  - toggles: "Reduced replay", "Fixed program" and, in the technical view only, "Original run".
- **The fix:** the fix explanation and the code change. Before the fix has run: "Press See the fix work to compare."
- **Details:**
  - the full gremlin log (plain columns Time · Move · Gremlin; technical: Time · Signal · Value · Gremlin);
  - the tries and seed fields;
  - "<N> million chip cycles/s on this computer", computed from this run's total cycles and wall time;
  - the exact rule sentence, the exact story and "Try removing a move".
  - Some of these show only with technical details on: the seed, the cycles, the exact rule, the exact story, "Try removing", and the Original run toggle.

## 7. Scenes (original SVG; continuous motion as pure functions of the cursor)

**Crosswalk (top-down):**
- A road left to right, zebra stripes top to bottom, a stop line, sidewalks.
- The car has a hood, a windshield and headlights. It drives right only while the car light is green or yellow, stops at the stop line on red, and **never enters the stripes while the walk sign is on or the walker is on the stripes**. Headlights are always on (the "ready" cue).
- The **car signal** is a vertical three-light head mounted at the stop line; the **walk signal** is a box mounted at the crossing.
- When the car light is green and the walk sign is on together, each signal gets a coral ring and the badge "Both have a green!" shows.
- The walker (a neutral person figure, **not a ghost**) waits on the top sidewalk and crosses while the walk sign is on, finishing its crossing if the sign goes off.
- A **walk-button post** on the top sidewalk with the Masher icon. On each REQUEST event in the shown replay, Masher presses: the button lamp lights while pressed, with a short "press" burst of 150 ms.
- HTML labels: "Car light: green/yellow/red", "Walk sign: on/off", "Walk button".

**Garage:**
- Frame and slatted door. The door position follows the motor outputs (existing DOOR_TRAVEL logic), continuously.
- The **pumpkin** appears at the earliest BEAM_CLEAR gremlin event in the shown replay and stays.
- The beam line shows the real BEAM_CLEAR level: blocked = amber dashed line broken at the pumpkin; clear = solid. The "Beam blocked" / "Beam clear" label sits beside the receiver on the right.
- If the beam level changed more than once within 10 ms of the cursor: "Sensor reading flickers".
- At the deadline breach, a coral badge **above** the frame reads "20 ms deadline missed · door still closing". No outline is drawn over the door.

**I'm-alive light:**
- "Sensor", then a "Program" box, then the "I'm-alive light".
- A ring around the light fills with the time since the light last changed and resets on every change. Past 600 ms it turns coral and the label reads "stuck on for 600 ms" or "stuck off for 600 ms". Otherwise the label reads "blinking = program running".
- When the stuck gremlin holds the sensor, its icon sits on the sensor.
- One line under the scene: "While waiting on the sensor, the program forgot to blink." This line is for the buggy build only: show it only when the I'm-alive rule broke.

**Gremlin icons:** six original drawings, from mockup 06:
- masher: round, with a hammer;
- bouncer: on a spring, with jitter marks;
- stuck: sitting on a button;
- dropout: with a pulled plug;
- spike: with a lightning bolt;
- drifter: with a slow wave.

All are pumpkin-coloured line art; a dimmed variant is used for disabled ones. The same icons are used on the chips, as timeline markers, in the legend and in the scenes.

## 8. Rule presets ("Change rule ▾")

- Each example offers its own rule. Where the rule has a number (garage 20 ms, I'm-alive 600 ms), add a number control: whole ms, 1–60,000.
- Changing the number rebuilds the canonical sentence through the existing render/parse path and the rule box checks.
- With a non-default number, the headline becomes "Custom rule: " plus a plain rendering of the rule.
- Crosswalk has no number, so it shows only its rule.
- The free-text editor stays in the technical view.
- No drop-down rule builder in this feature.

## 9. Copy (exact strings)

- **Why it matters:**
  - crosswalk: "A walker could step out while cars are moving."
  - garage: "The door could keep closing on something in the doorway."
  - I'm-alive: "The light blinks to show the program is running. If it freezes, the program is stuck."
- **Friendly labels:** HEARTBEAT is "I'm-alive light" and PULSE is "Sensor". Story and move phrases say "sensor" (for example "held the sensor on"), and example card and scene titles say "I'm-alive light".
- **Plain story:** name the gremlin with a capital letter instead of "The gremlin" ("Masher pressed the walk button, let go, then pressed and held it, all within 131 ms. …"). If the gremlin changes between moves, name the new one. Keep the span sentences.
- **Cause lines** (BROKE card). Show each only when the reduced list's fingerprint equals that example's pinned fingerprint; otherwise show no cause line:
  - crosswalk (47078989121ebc1d): "Two quick presses, the second one held, did it."
  - garage (616062947f71a1ae): "A flickering beam (blocked, cleared, blocked again within 4 ms) did it."
  - I'm-alive (19827a4e0a7ad440): "Holding the sensor on did it."
- **Fix explanations** (check each against the sources; correct and report any mismatch):
  - crosswalk: "In the original program, pressing the button again during a crossing restarted the walk timer. The car lights did not wait for it, so cars got a green while the walk sign was still on. The fix removes that restart."
  - garage: "The original program treated several quick beam breaks as noise and kept closing. Only a single clean break made the door reverse. The fix reverses the door on any break."
  - I'm-alive: "The original program waited for the sensor to let go, with no time limit. A stuck sensor froze it, so the light stopped blinking. The fix stops waiting after a time limit."
- **Gremlin plain text:**
  - masher: "presses a button over and over, fast"
  - bouncer: "makes a button or sensor flicker on and off for a split second, like a loose wire"
  - stuck: "holds a button down and never lets go"
  - dropout: "makes a signal that is normally on cut out for a moment"
  - spike: "makes a dial-type reading (like a temperature sensor) jump suddenly"
  - drifter: "slowly pushes a dial-type reading up or down"
  - The analog reason reads "Needs a dial-type input, like a temperature sensor".
- **COULDN'T TELL card:** "This program can't be judged here." followed by each engine reason as a list item (split on "; "), then "No result is better than a wrong one." With technical details on, also show the register and the cycle.
- **Labels stay the same in both views.** The technical view only adds detail: there is no "Campaign" / "Rule area" swap and no second tagline.

## 10. Motion

| Moment | What moves | Duration |
|---|---|---|
| Verdict appears | Fade in plus the coral edge drawing in | 250 ms |
| Shrink | Dots dim per real attempt, then collapse | 150 ms per attempt, 400 ms collapse |
| Replay | Car, walker, door and ring are continuous; lights switch instantly | Paced as in section 5 |
| Break | Everything except the conflicting outputs dims to 40%; caption appears | 300 ms in, then hold |
| Tabs | Cross-fade | 150 ms |
| Setup collapse | Height transition | 250 ms |

With `prefers-reduced-motion`: no auto-play, no tweens (step changes only), and the freeze frame and captions stay.

## 11. Acceptance (Node side; existing pins unchanged)

- All existing acceptance values still pass:
  - runs 4/24, 8/40, 2/24;
  - seeds;
  - 8→3, 7→3, 2→1;
  - the three fingerprints;
  - HELD texts;
  - span pins.
- New pure-function tests:
  - replay pacing (segment about 8 s; at least 400 ms on screen per move inside clusters; the badge factor);
  - relative move times (crosswalk +0 / +65 / +131 / break +450);
  - cause-line gating by fingerprint;
  - car / walker / door / ring positions, including **the car never entering the stripes while the walker is on them**, as a property test over random edge sequences;
  - the pumpkin and flicker logic;
  - the elapsed rounding (870 ms gives "0.9 s");
  - the cycles/s calculation;
  - the 1-minimal sentence only when the reducer did not stop at its budget;
  - the preset number round-trip through render/parse.
- The copy scan covers every new string. Pinned strings that change (heartbeat labels, story naming) are updated in `tests/ui` only.