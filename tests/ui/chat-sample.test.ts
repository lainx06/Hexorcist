// The "Try a chat-written sketch" sample: a chat AI's crossing sketch, unedited, with the rule it broke.
// Through the page's own request builder and worker-host jobs: BROKE on try 1 of 24, reduced to one press,
// fingerprint a535ab6ae6984890 (the same value `npm run check` gives for this HEX, pins, rule and seed).
import { describe, expect, it } from "vitest";
import { buildCampaignRequest, initialUpload, loadChatSample, uploadReady } from "../../src/ui/app/model/upload-state";
import { runCampaignJob, runReductionJob, runReplayJob } from "../../src/ui/app/worker/host";

describe("chat-written sample", () => {
  it("loads ready and breaks the WALK + DONT_WALK rule on one press", { timeout: 300_000 }, () => {
    const s = loadChatSample(initialUpload());
    expect(s.selected).toEqual(["masher"]);
    expect(s.ruleText).toBe("all of (WALK is 1, DONT_WALK is 1) must never happen.");
    expect(uploadReady(s, false)).toBe(true);
    const req = buildCampaignRequest(s);
    if (req === null) throw new Error("no request");
    const c = runCampaignJob(req);
    if (!c.ok) throw new Error(c.error.message);
    const v = c.result.verdict;
    if (v.verdict !== "BROKE") throw new Error(`expected BROKE, got ${v.verdict}`);
    expect(c.result.violatingRunIndex).toBe(0);
    const red = runReductionJob({ hex: req.hex, fixture: req.fixture, ruleSet: req.ruleSet, originalList: v.trace.eventList, violation: v.trace.violation, runCycles: req.runCycles });
    if (!red.ok) throw new Error(red.error.message);
    expect(red.result.reducedEventCount).toBe(1);
    const rep = runReplayJob({ hex: req.hex, fixture: req.fixture, ruleSet: req.ruleSet, events: red.result.reducedList, runCycles: req.runCycles });
    if (!rep.ok) throw new Error(rep.error.message);
    expect(rep.fingerprint).toBe("a535ab6ae6984890");
  });
});
