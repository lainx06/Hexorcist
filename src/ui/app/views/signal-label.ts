// A lane or log label from SignalLabels: the Examples keep signalLabel; an upload shows the Display_Name,
// with the Signal_Name beside it in the Technical_View when a Plain_Name is set (so never twice).
import { labelOf } from "../model/signal-labels";
import type { SignalLabels } from "../model/signal-labels";
import { signalLabel, techOnly } from "./details";
import { el } from "./dom";

export function labelNode(signal: string, labels: SignalLabels): HTMLElement {
  if (labels.kind === "example") return signalLabel(signal);
  const f = labelOf(labels, signal);
  if (!f.known) return el("span", { class: "signal-label" }, [signal]);
  return el("span", { class: "signal-label" }, [f.text, techOnly(el("code", { class: "signal-name mono" }, [signal]))]);
}