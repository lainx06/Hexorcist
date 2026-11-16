// Feature: bench-ui-core. Speed page comparisons. Evidence, not proof.
import { describe, expect, it } from "vitest";
import { heldText } from "../../src/engine/verdict";
import { compareFingerprint, compareGarage, cyclesPerSecond, PINNED_CROSSWALK_FINGERPRINT } from "../../src/ui/app/model/speed";

describe("speed model", () => {
  it("compares with the pinned Node values", () => {
    expect(PINNED_CROSSWALK_FINGERPRINT).toBe("47078989121ebc1d");
    expect(compareFingerprint("47078989121ebc1d")).toBe("matches");
    expect(compareFingerprint("0000000000000000")).toBe("differs");
    expect(compareFingerprint(null)).toBe("differs");
    expect(compareGarage({ verdict: "HELD", text: heldText(40), runs: 40 })).toBe("matches");
    expect(compareGarage({ verdict: "HELD", text: heldText(39), runs: 39 })).toBe("differs");
    expect(compareGarage({ verdict: "COULDN'T TELL", reason: "x" })).toBe("differs");
    expect(compareGarage(null)).toBe("differs");
  });

  it("cycles per second", () => {
    expect(cyclesPerSecond(16_000_000, 2)).toBe(8_000_000);
    expect(cyclesPerSecond(10, 0)).toBeNull();
  });
});