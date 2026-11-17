// The Run_Length_Field of the Upload_Device: whole milliseconds, 1 to 60,000. DOM builder; the page owns the value.
import { RUN_LENGTH_MESSAGE, checkRunLength } from "../model/upload-fields";
import { el } from "./dom";

export const RUN_LENGTH_LABEL = "Run length in ms";

export interface RunLengthFieldView {
  node: HTMLElement;
  /** Sets the text (when it differs, so the caret stays) and its message. */
  paint(text: string, busy: boolean): void;
}

export function createRunLengthField(onText: (text: string) => void): RunLengthFieldView {
  const input = el("input", {
    id: "run-length-field",
    class: "field mono",
    type: "text",
    inputmode: "numeric",
    value: "",
    "aria-describedby": "run-length-msg",
    "aria-invalid": "false",
  });
  const msg = el("p", { id: "run-length-msg", class: "field-msg meta", "aria-live": "polite" }, [""]);
  input.addEventListener("input", () => onText(input.value));
  const node = el("div", { class: "field-row" }, [el("label", { for: "run-length-field" }, [RUN_LENGTH_LABEL]), input, msg]);
  return {
    node,
    paint(text, busy) {
      if (input.value !== text) input.value = text;
      const ok = checkRunLength(text).ok;
      msg.textContent = ok ? "" : RUN_LENGTH_MESSAGE;
      input.setAttribute("aria-invalid", ok ? "false" : "true");
      input.readOnly = busy;
    },
  };
}