// Details_Switch helpers. Technical_Elements and plain-only elements carry data-detail and are
// shown or hidden with the hidden attribute only; nothing re-renders on a switch change.
import { DETAILS_KEY, detailsFromStored } from "../model/details";
import { friendlyLabel } from "../model/labels";
import { el } from "./dom";

/** The stored view, or false when storage is missing or throws. */
export function readDetails(): boolean {
  try {
    return detailsFromStored(localStorage.getItem(DETAILS_KEY));
  } catch {
    return false;
  }
}

/** Writes "on" or "off"; a throwing or missing storage is ignored. */
export function writeDetails(on: boolean): void {
  try {
    localStorage.setItem(DETAILS_KEY, on ? "on" : "off");
  } catch {
    // The view still changes for this page load.
  }
}

// The view in force when a node is made. Read from storage on the initial call.
let current: boolean | null = null;

export function currentDetails(): boolean {
  if (current === null) current = readDetails();
  return current;
}

/** Marks a Technical_Element: hidden in the Plain_View. */
export function techOnly<T extends HTMLElement>(node: T): T {
  node.setAttribute("data-detail", "tech");
  node.hidden = !currentDetails();
  return node;
}

/** Marks a plain-only element: hidden in the Technical_View. */
export function plainOnly<T extends HTMLElement>(node: T): T {
  node.setAttribute("data-detail", "plain");
  node.hidden = currentDetails();
  return node;
}

/** Sets the view and the hidden attribute of every marked node under root. */
export function applyDetails(root: ParentNode, on: boolean): void {
  current = on;
  for (const n of Array.from(root.querySelectorAll("[data-detail]"))) {
    n.toggleAttribute("hidden", n.getAttribute("data-detail") === "tech" ? !on : on);
  }
}

/** Marks any element, SVG included, as tech or plain and sets its hidden attribute from the current view. */
export function markDetail<T extends Element>(node: T, kind: "tech" | "plain"): T {
  node.setAttribute("data-detail", kind);
  node.toggleAttribute("hidden", kind === "tech" ? !currentDetails() : currentDetails());
  return node;
}

/** The Friendly_Label of a signal, with the signal name in monospace in the Technical_View. */
export function signalLabel(signal: string): HTMLElement {
  const f = friendlyLabel(signal);
  if (!f.known) return el("span", { class: "signal-label" }, [signal]);
  return el("span", { class: "signal-label" }, [f.text, techOnly(el("code", { class: "signal-name mono" }, [signal]))]);
}
