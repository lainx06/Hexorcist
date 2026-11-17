// Player: Play/Pause, Replay and the Speed_Slider, in one row (it wraps on a phone). Copy comes from PLAYER_TEXT.
// The slider runs from the paced replay on the left to real speed (1x) on the right. Moving it changes
// only the mapping from UI time to Cursor (see playback.ts); a new plan puts the thumb back at the left.

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
  const playBtn = el("button", { type: "button", class: "icon-button player-play" });
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
  const root = el("div", { class: "player-bar", role: "group", "aria-label": "Player" }, [playBtn, replayBtn, speed]);

  function paint(playing: boolean): void {
    const name = playing ? PLAYER_TEXT.pause : PLAYER_TEXT.play;
    setChildren(playBtn, [playing ? pauseIcon() : playIcon(), name]);
  }
  paint(playback.playing());

  playBtn.addEventListener("click", () => {
    if (playback.playing()) playback.pause();
    else playback.play();
  });
  replayBtn.addEventListener("click", () => playback.replay());
  slider.addEventListener("input", () => playback.setSlider(sliderToStep(Number(slider.value))));
  const offState = playback.onState(paint);
  const offSlider = playback.onSlider((v) => {
    slider.value = String(v);
  });

  return {
    root,
    dispose() {
      offState();
      offSlider();
    },
  };
}
