// The Program_Section of the Upload_Device: the .hex file, the sample, the Help_Line, the Pin_Table and the
// pin map buttons. DOM builder; it holds no state and paints from the page's UploadState.
import { MAX_PINS } from "../model/pin-table";
import type { RowPatch } from "../model/pin-table";
import { UPLOAD_COPY } from "../model/upload-copy";
import { sizeText } from "../model/upload-hex";
import { uploadChecklist, visibleErrors } from "../model/upload-state";
import type { UploadDerived, UploadState } from "../model/upload-state";
import { techOnly } from "./details";
import { el, setChildren } from "./dom";
import { createPinTable } from "./pin-table";

export interface ProgramSectionCallbacks {
  onHexFile(file: File): void;
  onSample(): void;
  onDownloadSample(): void;
  /** Loads the serial-port program, which gives COULDN'T TELL. */
  onSerialSample(): void;
  /** Loads a crossing sketch a chat AI wrote, with the rule it broke. */
  onChatSample(): void;
  onImport(file: File): void;
  onExport(): void;
  onAddRow(): void;
  onRemoveRow(id: number): void;
  onEditRow(id: number, patch: RowPatch): void;
}

export interface ProgramSectionView {
  node: HTMLElement;
  paint(state: UploadState, derived: UploadDerived, busy: boolean): void;
}

/** A visually hidden file input with a button-styled label; the label shows the input's focus ring. */
function fileButton(id: string, accept: ".hex" | ".json", text: string, onFile: (f: File) => void) {
  const input =
    accept === ".hex"
      ? el("input", { id, class: "file-input", type: "file", accept: ".hex" })
      : el("input", { id, class: "file-input", type: "file", accept: ".json" });
  const label = el("label", { for: id, class: "secondary file-button" }, [text]);
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    // Reset so choosing the same file again fires change; closing the chooser with no file does nothing.
    input.value = "";
    if (f !== undefined) onFile(f);
  });
  return { input, label, node: el("span", { class: "file-control" }, [input, label]) };
}

export function createProgramSection(cb: ProgramSectionCallbacks): ProgramSectionView {
  const hex = fileButton("hex-file", ".hex", UPLOAD_COPY.chooseHex, (f) => cb.onHexFile(f));
  const loaded = el("p", { class: "loaded-line mono" }, [""]);
  const hexError = el("p", { class: "error-text hex-error", role: "alert" }, [""]);
  const parserLine = techOnly(el("p", { class: "meta mono hex-parser" }, [""]));
  const help = el("p", { class: "meta help-line" }, [UPLOAD_COPY.helpLine]);
  const sample = el("button", { type: "button", class: "secondary" }, [UPLOAD_COPY.trySample]);
  const download = el("button", { type: "button", class: "secondary" }, [UPLOAD_COPY.downloadSample]);
  const serial = el("button", { type: "button", class: "secondary" }, [UPLOAD_COPY.trySerialSample]);
  sample.addEventListener("click", () => cb.onSample());
  serial.addEventListener("click", () => cb.onSerialSample());
  const chat = el("button", { type: "button", class: "secondary" }, [UPLOAD_COPY.tryChatSample]);
  chat.addEventListener("click", () => cb.onChatSample());
  download.addEventListener("click", () => cb.onDownloadSample());
  const table = createPinTable({ onRemoveRow: (id) => cb.onRemoveRow(id), onEditRow: (id, p) => cb.onEditRow(id, p) });
  const add = el("button", { type: "button", class: "secondary" }, [UPLOAD_COPY.addPin]);
  add.addEventListener("click", () => cb.onAddRow());
  const imp = fileButton("pin-map-file", ".json", UPLOAD_COPY.importPins, (f) => cb.onImport(f));
  const exp = el("button", { type: "button", class: "secondary" }, [UPLOAD_COPY.exportPins]);
  exp.addEventListener("click", () => cb.onExport());
  const importError = el("p", { class: "error-text import-error", role: "alert" }, [""]);
  // One muted line of steps, each ticked when done; it replaces red errors until the visitor acts.
  const checklist = el("div", { class: "meta upload-checklist" });

  const node = el("section", { class: "setup-section program-section", "aria-labelledby": "program-title" }, [
    el("h2", { class: "section-title", id: "program-title" }, [UPLOAD_COPY.sectionTitle]),
    el("div", { class: "program-row" }, [hex.node, sample, chat, serial, download]),
    loaded,
    hexError,
    parserLine,
    help,
    table.node,
    el("div", { class: "program-row" }, [add, imp.node, exp]),
    importError,
    checklist,
  ]);

  return {
    node,
    paint(s, d, busy) {
      const p = s.program;
      loaded.textContent = p === null ? "" : `${UPLOAD_COPY.loadedPrefix}${p.name} \u00b7 ${sizeText(p.bytes)}`;
      loaded.hidden = p === null;
      hexError.textContent = s.hexError?.text ?? "";
      hexError.hidden = s.hexError === null;
      parserLine.textContent = s.hexError?.parser ?? "";
      importError.textContent = s.importError ?? "";
      importError.hidden = s.importError === null;
      table.paint(s.rows, visibleErrors(s, d).table, busy);
      const steps = uploadChecklist(s);
      checklist.hidden = steps.every((x) => x.done);
      setChildren(checklist, [
        el("span", { class: "upload-checklist-prefix" }, [UPLOAD_COPY.checklist.prefix]),
        el("ul", { class: "upload-checklist-list" }, steps.map((x) =>
          el("li", { class: x.done ? "is-done" : "" }, [el("span", { class: "upload-check", "aria-hidden": "true" }, [x.done ? "\u2713" : "\u25cb"]), x.text]),
        )),
      ]);
      hex.input.disabled = busy;
      imp.input.disabled = busy;
      for (const l of [hex.label, imp.label]) l.classList.toggle("is-disabled", busy);
      sample.disabled = busy;
      serial.disabled = busy;
      chat.disabled = busy;
      add.disabled = busy || s.rows.length >= MAX_PINS;
      exp.disabled = s.rows.length === 0;
    },
  };
}