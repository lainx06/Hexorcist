// Tab keyboard model. Pure: no DOM, no clock, no randomness.
import { TAB_TEXT } from "./stage-copy";

export const TAB_COUNT = TAB_TEXT.names.length;

/** Index after a key press: Left and Right move to the previous or next tab, wrapping at both ends. */
export function tabAfterKey(index: number, key: string, count: number = TAB_COUNT): number {
  if (key === "ArrowLeft" || key === "Left") return (index - 1 + count) % count;
  if (key === "ArrowRight" || key === "Right") return (index + 1) % count;
  return index;
}

/** Roving tabindex per tab: 0 on the selected tab, -1 on every other tab. */
export function tabIndexes(selected: number, count: number = TAB_COUNT): number[] {
  return Array.from({ length: count }, (_, i) => (i === selected ? 0 : -1));
}
