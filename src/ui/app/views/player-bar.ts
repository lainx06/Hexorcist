// Player: a round Play/Pause button, Replay, the Speed_Slider and the speed badge, in one row that wraps
// on a phone. Copy comes from PLAYER_TEXT. The slider runs from the paced replay on the left to real speed
// (1x) on the right. Moving it changes only the mapping from UI time to Cursor (see playback.ts); a new plan
// puts the thumb back at the left. The speed badge shows the Slow_Factor at the Cursor.

import { speedBadge } from "../model/pacing";
import { SLIDER_REAL, stepToSlider, sliderToStep } from "../model/slider";
import { PLAYER_TEXT } from "../model/stage-copy";
import { el, setChildren } from "./dom";
import { pauseIcon, playIcon } from "./icons";
import type { Playback } from "./playback";

export interface PlayerBar {
  root: HTMLElement;
  dispose(): void;
}

export function createPlayerBar(playback: Playback): PlayerBar {
  const playBtn = el("button", { type: "button", class: "player-play" });
  const replayBtn = el("button", { type: "button", class: "secondary player-replay" }, [PLAYER_TEXT.replay]);
  const slider = el("input", {
    type: "range",
    class: "speed-input",
    "aria-label": `${PLAYER_TEXT.speedLabel}: ${PLAYER_TEXT.slower} to ${PLAYER_TEXT.realSpeed}`,
    min: 0,
    max: SLIDER_REAL,
    step: 1,
    value: stepToSlider(playback.slider()),
  });
  // Left end: the paced (slower) replay. Right end: real speed.
  const speed = el("div", { class: "speed-slider" }, [
    el("span", { class: "speed-end" }, [PLAYER_TEXT.slower]),
    slider,
    el("span", { class: "speed-end" }, [PLAYER_TEXT.realSpeed]),
  ]);
  const badge = el("span", { class: "player-speed-badge", hidden: true }, [""]);
  const root = el("div", { class: "player-bar", role: "group", "aria-label": "Player" }, [playBtn, replayBtn, speed, badge]);

  /** The mint fill left of the thumb, for browsers that have no progress part of their own. */
  function paintFill(): void {
    const v = Number(slider.value);
    slider.style.setProperty("--fill", `${String((100 * v) / SLIDER_REAL)}%`);
  }

  function paint(playing: boolean): void {
    // Icon only; the name is in aria-label.
    const name = playing ? PLAYER_TEXT.pause : PLAYER_TEXT.play;
    playBtn.setAttribute("aria-label", name);
    playBtn.title = name;
    setChildren(playBtn, [playing ? pauseIcon() : playIcon()]);
  }
  paint(playback.playing());
  paintFill();

  playBtn.addEventListener("click", () => {
    if (playback.playing()) playback.pause();
    else playback.play();
  });
  replayBtn.addEventListener("click", () => playback.replay());
  slider.addEventListener("input", () => {
    playback.setSlider(sliderToStep(Number(slider.value)));
    paintFill();
  });
  const offState = playback.onState(paint);
  const offSlider = playback.onSlider((v) => {
    slider.value = String(v);
    paintFill();
  });
  const offCursor = playback.onCursor((_c, f) => {
    const text = speedBadge(f);
    if (badge.textContent !== text) badge.textContent = text;
    badge.hidden = false;
  });

  return {
    root,
    dispose() {
      offState();
      offSlider();
      offCursor();
    },
  };
}
