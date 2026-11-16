# Hexorcist design direction (for Phase H bench-ui; adopted Nov 14 from the ChatGPT design review)

Reference only: Kiro writes all code and SVG. The mockup image (user's local copy) is inspiration; every trace,
timestamp and count in the real UI comes from actual results.

**Idea:** a compact signal lab with mischievous inhabitants. The gremlins supply personality; the replay supplies
credibility. Defining image: two phosphor-green signals overlapping where the rule forbids it, with a restrained coral
marker exposing the contradiction.

## Layout (desktop)
- One workspace: configuration column on the left (about 360 px), evidence column on the right; 32 px outer padding,
  24 px gap, max width about 1,760 px. No marketing hero.
- Header: small wordmark, one-line explanation, "ATmega328P · Browser only".
- Example gallery: three cards (Crosswalk, Garage door, Heartbeat) with a mini scene motif; Crosswalk selected at start
  and labelled "Buggy example". "Load .hex" nearby as a secondary action (never implies browser compilation).
- Left column:
  - rule builder: template selector, chips, nested all/any with visible brackets, and the exact canonical sentence
    underneath in monospace;
  - gremlin picker: 3 x 2 tiles; selected = amber border + mark; incompatible tiles stay visible with a reason such
    as "Requires an analog input"; selecting reveals the target and parameter ranges;
  - campaign controls: runs N, seed, a full-width UNLEASH button, and progress beneath ("Completed 17 / 64 runs"), with
    no time estimates.
- Right column: verdict card on top (area reserved before a run with "Run a campaign to inspect the result."), the
  animated scene as the largest region with replay controls, the timeline directly below; one shared cursor for scene
  and all lanes.
- Capability panel: full-width disclosure under the workspace; collapsed summary "ATmega328P firmware execution ·
  Seeded input events · Illustrative scenes".
- Eye path: before a run, example -> rule -> UNLEASH; after, scene contradiction -> verdict -> timeline interval.
- Loading, replaying and reducing are activity labels, never verdicts. Layout stays stable as results arrive.

## Narrow screens (360-430 px)
- 16 px padding.
- Order: header + cards (horizontal scroll with a visible next-card edge), rule, gremlins (2 columns), controls,
  verdict, scene, timeline, capabilities.
- Offer "View result" instead of auto-scrolling.
- Timeline labels stay fixed while the plot scrolls; previous/next-event buttons and selected-event text.

## Palette (contrast against #1B2923)
| Role | Hex | Contrast |
|---|---|---|
| Page background | #0B100F | — |
| Panel | #121B18 | — |
| Raised surface | #1B2923 | — |
| Primary text | #EDF4EF | 13.54:1 |
| Secondary text | #A5B5AA | 7.05:1 |
| Signal green / primary action | #99F5AC | 11.54:1 |
| BROKE accent | #FF8A80 | 6.63:1 |
| COULDN'T TELL accent | #C4B5FD | 8.20:1 |
| Gremlin events / selection | #F3C982 | 9.72:1 |
| Control outlines (not text) | #6F8777 | 3.90:1 |

- Text on the green UNLEASH button: #0B100F (14.62:1).
- Green means signal activity, not approval.
- Outcomes differ by wording, icon shape and border, not only colour.
- Recheck contrast for tints and overlays.

## Type, spacing, motion
- **Fonts:** system UI sans-serif for prose and controls; system monospace for signal names, seeds, timestamps and
  canonical sentences.
- **Type sizes:**
  - verdict title 36/28 px bold;
  - page title 28/24;
  - region title 18 semibold;
  - body 16 (1.5);
  - chips/meta 14 (1.4);
  - timeline values tabular monospace 14-16.
- **Spacing:** scale 4, 8, 12, 16, 24, 32, 48; panel padding 24/16; corners 10 (panels), 6 (controls); targets
  >= 44 px.
- **Motion:**
  - hover 120-160 ms; disclosure about 180 ms;
  - one brief emphasis when a violation appears, no flashing or shake;
  - replay paused at the violation by default; speed changes presentation only;
  - prefers-reduced-motion removes decorative movement and shows static event states with previous/next controls;
  - announce progress and results accessibly without announcing every counter tick.

## Gremlin icons
All icons sit on a 32 x 32 grid with about 2 px strokes and two eyes. Silhouettes are distinct and readable in
monochrome. Names and behaviour labels stay visible; no idle animation.

| Gremlin | Body | Signal motif |
|---|---|---|
| Masher | broad low blob, two rectangular fists on a button | press marks |
| Bouncer | round body on zigzag spring feet | tight contact marks |
| Stuck | square body, hook hands clamped on a bar | one long high segment |
| Dropout | ring body with a notch missing at the bottom | a notch in an active signal |
| Spike | tall triangle body, uneven eyes | one abrupt excursion |
| Drifter | low asymmetric body with a rising back | staircase ramp |

## Scenes
- **Crosswalk:** flat side view.
  - Elements:
    - road rectangle with five crossing bars;
    - car (rounded body, trapezoid cabin, two wheels);
    - traffic light (housing, three circles, pole);
    - WALK sign with an original walking figure;
    - ghost (oval cap, two-lobed hem, dot eyes; no franchise look);
    - at most two shrubs and a curb.
  - Labels "CAR_GREEN = 1" and "WALK = 1" sit beside the lamp and sign, joined by a coral bracket at the violation.
  - No collision or injury: stop on the conflicting outputs.
  - Always show "Illustrative scene · firmware outputs shown".
- **Garage:** straight-on elevation.
  - Elements: frame, slatted door moving vertically, emitter/receiver blocks with an amber dashed beam, pumpkin (three
    overlapping ribbed ovals, curved stem, carved face; the door may close down onto it).
  - "Beam blocked" label when relevant.
  - Door position labelled illustrative.
  - Deadline highlighted only when the monitor reaches it.

## Timeline
- One lane per mapped signal plus a GREMLINS lane.
- Digital = crisp steps; analog = recorded values and real update steps (no smoothing).
- Gremlin markers are amber with a mini icon or letter.
- One shared cursor.
- Violation = coral marker, plus a hatched interval when an interval is established.
- Floating-input reads = explicit markers with text.
- Milliseconds for reading, CPU cycles on selection, selected values as text.
- Above it: "X events -> Y events" and "The smallest replay this reducer found."; the original run and the reduced
  replay are clearly labelled.

## Verdict cards
One shared structure for all three: title, finding, evidence scope, actions. Only the actual outcome is shown.
- **BROKE:**
  - coral left rail, large title, broken-link icon;
  - names the violated rule and the observed values;
  - run index, seed and replay location come from data;
  - drama comes from the frozen contradiction, not a warning banner.
- **HELD:**
  - neutral outline, ordinary weight, small bounded-trace icon;
  - no checkmark, shield, seal or celebratory fill; both sentences equally readable;
  - nearby: gremlin set, completed runs, run length, trigger counts, inputs touched;
  - never a percentage.
- **COULDN'T TELL:**
  - lavender left rail, open-bracket icon, calm layout;
  - the precise reason plus a next action, for example:
    - "The rule's trigger never happened" -> adjust the stimulus;
    - "This input was read while floating" -> review the input configuration;
  - no error triangle or red.

## Apply fix (bundled examples)
- A button reading "Load this example's bundled fixed .hex".
- Show a short description of the change and the new build identity.
- Replay the recorded counterexample on the fixed build.
- Rerun the campaign with the same rule, seed, gremlins and N.
- Keep the previous BROKE beside the new result.
- A fixed build can still give any of the three verdicts; one replay never stands in for the campaign.
- For uploads: "Load revised .hex" (no patching or compiling).

## Capability panel (expanded)
- What is modeled and checked.
- How firmware + configuration + seed + engine version reproduce a run.
- Limits:
  - internal pull-up modeled by our bridge; floating reads flagged; per-register diagnostics;
  - no electrical contention, RC settling, analog noise, brown-out or external delays;
  - unsupported peripherals not detected.
- What scenes do not establish.
- Measured browser throughput, labelled as local performance information.

## Video opening frame (1920 x 1080, about 64 px margins, gallery collapsed to a strip)
- Paused replay with CAR_GREEN and WALK both 1.
- Wordmark and Crosswalk in the upper left.
- On the left: the rule, the gremlins and the real run count.
- In the main panel: a large BROKE and "CAR_GREEN and WALK were both 1."
- The scene with both outputs lit, the ghost beside the crossing and the car visible.
- The same moment marked across the lanes.
- A small illustrative-scene qualifier.
- Essential text about 24 px on screen.
- Hold about 2 s, then step back and replay at 0.1x to the contradiction.
