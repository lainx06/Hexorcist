import { describe, expect, it } from "vitest";
import { findGremlin } from "../../src/engine/gremlins/catalogue";
import { isCompatibleForUpload } from "../../src/ui/app/model/gremlin-picker";
import { newDigitalRow, previewFixture } from "../../src/ui/app/model/pin-table";
import { addRow, initialUpload, removeRow, toggleGremlin } from "../../src/ui/app/model/upload-state";
import type { UploadState } from "../../src/ui/app/model/upload-state";

function withButton(): UploadState {
  const s = initialUpload();
  const row = { ...newDigitalRow(1), signal: "BTN", port: "D", bit: 2 };
  return { ...s, rows: [row], nextRowId: 2, autoMasher: false };
}

describe("upload prune uses the upload picker rule", () => {
  it("removes a hidden gremlin (Spike, no analog pin) and keeps a visible one (Masher)", () => {
    const s = { ...withButton(), selected: ["spike", "masher"] };
    const spike = findGremlin("spike");
    const masher = findGremlin("masher");
    expect(spike).toBeDefined();
    expect(masher).toBeDefined();
    const fixture = previewFixture(s.rows);
    expect(isCompatibleForUpload(spike!, fixture)).toBe(false);
    expect(isCompatibleForUpload(masher!, fixture)).toBe(true);

    const next = addRow(s);
    expect(next.selected).not.toContain("spike");
    expect(next.selected).toContain("masher");
  });

  it("prunes on row removal too, and a hidden gremlin cannot be toggled on", () => {
    const s = { ...withButton(), selected: ["spike"] };
    expect(removeRow(s, 99).selected).toEqual([]);
    expect(toggleGremlin(withButton(), "spike").selected).toEqual([]);
  });
});
