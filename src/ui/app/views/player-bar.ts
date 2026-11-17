// Player: Play/Pause, Replay and the Speed_Slider. Copy comes from PLAYER_TEXT.
// Moving the slider changes only the mapping from UI time to Cursor (see playback.ts).

import { SLIDER_MAX } from "../model/pacing";
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
  const sliderId = "speed-slider-input";
  const slider = el("input", {
    type: "range",
    id: sliderId,
    min: 0,
    max: SLIDER_MAX,
    step: 1,
    value: playback.slider(),
  });
  const label = el("label", { for: sliderId, class: "speed-end" }, [PLAYER_TEXT.speedLabel]);
  const speed = el("div", { class: "speed-slider" }, [label, slider]);
  const root = el("div", { class: "player-bar", role: "group", "aria-label": "Player" }, [playBtn, replayBtn, speed]);

  function paint(playing: boolean): void {
    const name = playing ? PLAYER_TEXT.pause : PLAYER_TEXT.play;
    playBtn.setAttribute("aria-label", name);
    playBtn.title = name;
    setChildren(playBtn, [playing ? pauseIcon() : playIcon()]);
  }
  paint(playback.playing());

  playBtn.addEventListener("click", () => {
    if (playback.playing()) playback.pause();
    else playback.play();
  });
  replayBtn.addEventListener("click", () => playback.replay());
  slider.addEventListener("input", () => playback.setSlider(Number(slider.value)));
  const off = playback.onState(paint);

  return {
    root,
    dispose: off,
  };
}
