// Playback controller. The UI clock is the requestAnimationFrame timestamp. It drives display only:
// it never reaches rule timing and nothing here is posted to the Engine_Worker.

import { cursorAt, positionOf, slowFactorAt, totalUnits, POS_PER_MS, type PacingPlan, type Ratio } from "../model/pacing";
import { SLIDER_PACED, sliderToStep, stepToSlider } from "../model/slider";
import { prefersReducedMotion } from "./dom";

export type CursorListener = (cycle: number, slowFactor: Ratio) => void;
export type StateListener = (playing: boolean) => void;
export type SliderListener = (value: number) => void;

export interface PlaybackOptions {
  /** Frame scheduler; defaults to window.requestAnimationFrame. The callback gets the UI clock in ms. */
  raf?: (cb: (uiMs: number) => void) => number;
  cancel?: (handle: number) => void;
  reducedMotion?: () => boolean;
}

export interface Playback {
  /** Loads a paced plan. The slider goes back to its left (paced) end. */
  load(plan: PacingPlan, autoPlay: boolean): void;
  play(): void;
  pause(): void;
  /** Restart from S at the current slider position. */
  replay(): void;
  /** Moves the Cursor to `cycle` (clamped to the plan) and pauses. The scrubber of the Signals tab uses this. */
  seek(cycle: number): void;
  setSlider(value: number): void;
  slider(): number;
  playing(): boolean;
  cursor(): number;
  plan(): PacingPlan | null;
  /** Counts jumps of the Cursor that are not playback: a new plan, Replay, a seek. Scene actors place themselves on a change. */
  epoch(): number;
  /** Display ms of continuous play until the Cursor reaches `cycle` at the current slider step; null when not playing. */
  msUntil(cycle: number): number | null;
  onCursor(cb: CursorListener): () => void;
  onState(cb: StateListener): () => void;
  /** The slider value changed (the user moved it, or a plan loaded and put it back at the left end). */
  onSlider(cb: SliderListener): () => void;
  dispose(): void;
}

export function createPlayback(opts: PlaybackOptions = {}): Playback {
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
  const cancel = opts.cancel ?? ((h) => cancelAnimationFrame(h));
  const reduced = opts.reducedMotion ?? prefersReducedMotion;

  let plan: PacingPlan | null = null;
  let step = 0;
  let pos = 0; // position units (1/160,000 UI ms) of the plan at the current step
  let anchorTs: number | null = null;
  let anchorPos = 0;
  let isPlaying = false;
  let jumps = 0;
  let handle: number | null = null;
  const cursorSubs = new Set<CursorListener>();
  const stateSubs = new Set<StateListener>();
  const sliderSubs = new Set<SliderListener>();

  function emit(): void {
    if (plan === null) return;
    const c = cursorAt(plan, step, pos);
    const f = slowFactorAt(plan, step, pos);
    for (const cb of cursorSubs) cb(c, f);
  }

  function setPlaying(p: boolean): void {
    if (isPlaying === p) return;
    isPlaying = p;
    for (const cb of stateSubs) cb(p);
  }

  function emitSlider(): void {
    for (const cb of sliderSubs) cb(stepToSlider(step));
  }

  function stopLoop(): void {
    if (handle !== null) cancel(handle);
    handle = null;
    anchorTs = null;
  }

  function frame(ts: number): void {
    handle = null;
    if (plan === null || !isPlaying) return;
    if (anchorTs === null) {
      anchorTs = ts;
      anchorPos = pos;
    }
    const total = totalUnits(plan, step);
    const next = anchorPos + Math.floor(Math.max(0, ts - anchorTs) * POS_PER_MS);
    if (next >= total) {
      pos = total;
      emit();
      stopLoop();
      setPlaying(false);
      return;
    }
    pos = next;
    emit();
    handle = raf(frame);
  }

  function start(): void {
    if (plan === null) return;
    stopLoop();
    anchorTs = null;
    anchorPos = pos;
    setPlaying(true);
    handle = raf(frame);
  }

  function jumpToEnd(): void {
    if (plan === null) return;
    stopLoop();
    pos = totalUnits(plan, step);
    emit();
    setPlaying(false);
  }

  return {
    load(p, autoPlay) {
      stopLoop();
      setPlaying(false);
      plan = p;
      pos = 0;
      jumps++;
      step = SLIDER_PACED;
      emitSlider();
      if (autoPlay && reduced()) jumpToEnd();
      else if (autoPlay) {
        emit();
        start();
      } else emit();
    },
    play() {
      if (plan === null || isPlaying) return;
      if (pos >= totalUnits(plan, step)) pos = 0;
      start();
    },
    pause() {
      if (!isPlaying) return;
      stopLoop();
      setPlaying(false);
    },
    replay() {
      if (plan === null) return;
      stopLoop();
      pos = 0;
      jumps++;
      emit();
      start();
    },
    seek(cycle) {
      if (plan === null) return;
      stopLoop();
      setPlaying(false);
      pos = positionOf(plan, step, cycle);
      jumps++;
      emit();
    },
    setSlider(s) {
      const next = sliderToStep(s);
      if (next === step) return;
      if (plan !== null) {
        // Keep the cursor at its cycle: re-anchor the position for the new mapping.
        const c = cursorAt(plan, step, pos);
        step = next;
        pos = positionOf(plan, step, c);
        anchorTs = null;
        anchorPos = pos;
        emit();
      } else step = next;
      emitSlider();
    },
    slider: () => step,
    playing: () => isPlaying,
    cursor: () => (plan === null ? 0 : cursorAt(plan, step, pos)),
    plan: () => plan,
    epoch: () => jumps,
    msUntil(cycle) {
      if (plan === null || !isPlaying) return null;
      return Math.max(0, (positionOf(plan, step, cycle) - pos) / POS_PER_MS);
    },
    onCursor(cb) {
      cursorSubs.add(cb);
      return () => cursorSubs.delete(cb);
    },
    onState(cb) {
      stateSubs.add(cb);
      return () => stateSubs.delete(cb);
    },
    onSlider(cb) {
      sliderSubs.add(cb);
      return () => sliderSubs.delete(cb);
    },
    dispose() {
      stopLoop();
      cursorSubs.clear();
      stateSubs.clear();
      sliderSubs.clear();
    },
  };
}
