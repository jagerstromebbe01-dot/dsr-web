import { describe, expect, it } from "vitest";
import { excessKurtosisToNonExcess } from "./dsr";
import { parseSkewInput, validateKurtosis } from "./validation";

describe("parseSkewInput", () => {
  it("parses ordinary numbers", () => {
    expect(parseSkewInput("-0.4")).toEqual({ value: -0.4, error: null, note: null });
    expect(parseSkewInput(" 1.5 ").value).toBe(1.5);
    expect(parseSkewInput("0").value).toBe(0);
  });

  it("treats an empty field as 0 but says so", () => {
    for (const raw of ["", "   "]) {
      const r = parseSkewInput(raw);
      expect(r.value).toBe(0);
      expect(r.error).toBeNull();
      expect(r.note).toMatch(/empty/i);
    }
  });

  it("gives an error (not a silent 0) for invalid text", () => {
    for (const raw of ["abc", "1,5", "--2", "NaN", "Infinity"]) {
      const r = parseSkewInput(raw);
      expect(r.error).not.toBeNull();
      expect(Number.isNaN(r.value)).toBe(true);
    }
  });
});

describe("validateKurtosis (non-excess convention)", () => {
  it("accepts normal kurtosis and the lower bound 1", () => {
    expect(validateKurtosis(3)).toBeNull();
    expect(validateKurtosis(1)).toBeNull();
    expect(validateKurtosis(25)).toBeNull();
  });

  it("rejects values below 1", () => {
    expect(validateKurtosis(0.99)).not.toBeNull();
    expect(validateKurtosis(0)).not.toBeNull();
    expect(validateKurtosis(-5)).not.toBeNull();
  });

  it("rejects non-finite values", () => {
    expect(validateKurtosis(NaN)).not.toBeNull();
    expect(validateKurtosis(Infinity)).not.toBeNull();
  });

  it("matches excess >= -2 after conversion", () => {
    expect(validateKurtosis(excessKurtosisToNonExcess(-2))).toBeNull();
    expect(validateKurtosis(excessKurtosisToNonExcess(-2.01))).not.toBeNull();
    expect(validateKurtosis(excessKurtosisToNonExcess(0))).toBeNull();
  });
});
