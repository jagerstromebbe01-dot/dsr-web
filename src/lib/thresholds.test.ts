import { describe, expect, it } from "vitest";
import { verdictFromDsr as verdictFromCheck } from "./check";
import { dsrTier } from "./color";
import { interpretDsr } from "./interpret";
import { DSR_GREEN_MIN, DSR_YELLOW_MIN, verdictFromDsr } from "./thresholds";

const GRID = [0, 0.2, 0.4999, DSR_YELLOW_MIN, 0.5001, 0.8, 0.9, 0.9499, DSR_GREEN_MIN, 0.9501, 0.99, 1];

function interpretationTier(dsr: number): "green" | "yellow" | "red" {
  const text = interpretDsr({ dsr, nTrials: 10, observedSRAnnualized: 1, benchmarkSRAnnualized: 0.5 });
  if (text.includes("statistically distinguishable from luck at the 95% level")) return "green";
  if (text.includes("only weakly distinguishable")) return "yellow";
  if (text.includes("no longer distinguishable")) return "red";
  throw new Error("unrecognised interpretation text");
}

describe("DSR thresholds", () => {
  it("are 0.95 and 0.50", () => {
    expect(DSR_GREEN_MIN).toBe(0.95);
    expect(DSR_YELLOW_MIN).toBe(0.5);
  });

  it("boundaries: 0.95 is green, 0.50 is yellow, just below each is the lower tier", () => {
    expect(verdictFromDsr(0.95)).toBe("green");
    expect(verdictFromDsr(0.9499999)).toBe("yellow");
    expect(verdictFromDsr(0.5)).toBe("yellow");
    expect(verdictFromDsr(0.4999999)).toBe("red");
  });

  it("check.ts, color.ts and interpret.ts all agree with thresholds.ts", () => {
    for (const dsr of GRID) {
      const expected = verdictFromDsr(dsr);
      expect(verdictFromCheck(dsr), `check.ts @ ${dsr}`).toBe(expected);
      expect(dsrTier(dsr), `color.ts @ ${dsr}`).toBe(expected);
      expect(interpretationTier(dsr), `interpret.ts @ ${dsr}`).toBe(expected);
    }
  });
});
