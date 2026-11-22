// The one-click COULDN'T TELL sample loads serial_hello and gives COULDN'T TELL naming the serial port.
import { describe, expect, it } from "vitest";
import { UNMODELLED_PERIPHERALS } from "../../src/engine/peripherals";
import { runCampaignJob } from "../../src/ui/app/worker/host";
import { buildCampaignRequest, initialUpload, loadSerialSample, uploadReady } from "../../src/ui/app/model/upload-state";

describe("serial sample", () => {
  it("loads ready and gives COULDN'T TELL naming the serial port", { timeout: 120_000 }, () => {
    const s = loadSerialSample(initialUpload());
    expect(s.selected).toEqual(["masher"]);
    expect(uploadReady(s, false)).toBe(true);
    const req = buildCampaignRequest(s);
    if (req === null) throw new Error("no request");
    const out = runCampaignJob(req);
    if (!out.ok) throw new Error(`campaign failed: ${JSON.stringify(out).slice(0, 200)}`);
    const v = out.result.verdict;
    expect(v.verdict).toBe("COULDN'T TELL");
    const serial = UNMODELLED_PERIPHERALS.find((r) => r.id === "USART0");
    if (serial === undefined) throw new Error("no USART0 row");
    if (v.verdict === "COULDN'T TELL") expect(v.reason).toContain(serial.plainName);
  });
});
