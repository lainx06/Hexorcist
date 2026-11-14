import { describe, expect, it } from "vitest";
import { checkPlanInput, type PlanInput } from "../step-plan";

const valid: PlanInput = {
  prevTarget: 0,
  cycleCount: 0,
  pendingCycles: [10, 20],
  runCycles: 100,
  maxStepCycles: 50,
};

describe("checkPlanInput", () => {
  it("returns null for a valid input", () => {
    expect(checkPlanInput(valid)).toBeNull();
  });

  it("rejects runCycles equal to cycleCount", () => {
    expect(checkPlanInput({ ...valid, cycleCount: 100 })?.kind).toBe("invalid-plan-input");
  });

  it("rejects runCycles below cycleCount", () => {
    expect(checkPlanInput({ ...valid, cycleCount: 101 })?.kind).toBe("invalid-plan-input");
  });

  it("rejects maxStepCycles below 1", () => {
    expect(checkPlanInput({ ...valid, maxStepCycles: 0 })?.kind).toBe("invalid-plan-input");
  });

  it.each(["prevTarget", "cycleCount", "runCycles", "maxStepCycles"] as const)(
    "rejects a non-integer %s",
    (field) => {
      expect(checkPlanInput({ ...valid, [field]: 1.5 })?.kind).toBe("invalid-plan-input");
    },
  );

  it.each(["prevTarget", "cycleCount", "runCycles", "maxStepCycles"] as const)("rejects NaN %s", (field) => {
    expect(checkPlanInput({ ...valid, [field]: NaN })?.kind).toBe("invalid-plan-input");
  });

  it("rejects a non-integer or NaN pending cycle", () => {
    expect(checkPlanInput({ ...valid, pendingCycles: [10, 2.5] })?.kind).toBe("invalid-plan-input");
    expect(checkPlanInput({ ...valid, pendingCycles: [NaN] })?.kind).toBe("invalid-plan-input");
  });
});
