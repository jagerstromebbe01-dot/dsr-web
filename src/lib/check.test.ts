import { describe, expect, it } from "vitest";
import { CheckInputError, runBacktestCheck, verdictFromDsr } from "./check";
import { expectedMaxSharpeRatio, nullHypothesisV } from "./dsr";
import { normCdf } from "./normal";

/** Alternating mean+d, mean-d: exactly symmetric (skew 0, kurtosis 1), population std = d. */
function alternating(mean: number, d: number, T: number): number[] {
  return Array.from({ length: T }, (_, i) => (i % 2 === 0 ? mean + d : mean - d));
}

describe("verdictFromDsr", () => {
  it("uses the 0.95 / 0.50 thresholds", () => {
    expect(verdictFromDsr(0.95)).toBe("green");
    expect(verdictFromDsr(0.9499)).toBe("yellow");
    expect(verdictFromDsr(0.5)).toBe("yellow");
    expect(verdictFromDsr(0.4999)).toBe("red");
    expect(verdictFromDsr(0)).toBe("red");
    expect(verdictFromDsr(1)).toBe("green");
  });
});

describe("runBacktestCheck - known series", () => {
  it("computes T, Sharpe, skew, kurtosis, and DSR as the formulas say", () => {
    const T = 252;
    const r = runBacktestCheck({ returns: alternating(0.005, 0.01, T), frequency: "daily", nTrials: 1 });
    const sampleStd = 0.01 * Math.sqrt(T / (T - 1));
    expect(r.T).toBe(T);
    expect(r.N).toBe(1);
    expect(r.sharpe).toBeCloseTo(0.005 / sampleStd, 10);
    expect(r.skew).toBeCloseTo(0, 10);
    expect(r.kurtosis).toBeCloseTo(1, 10); // two-point symmetric distribution
    expect(r.sharpeAnnualized).toBeCloseTo(r.sharpe * Math.sqrt(252), 10);
    // N = 1 -> benchmark 0; denominator = sqrt(1 - 0 + 0) = 1
    expect(r.benchmarkSR).toBe(0);
    expect(r.dsr).toBeCloseTo(normCdf(r.sharpe * Math.sqrt(T - 1)), 10);
    expect(r.vEstimated).toBe(true);
    expect(r.vUsed).toBeCloseTo(nullHypothesisV(T), 12);
  });

  it("green: strong edge, a single trial", () => {
    const r = runBacktestCheck({ returns: alternating(0.005, 0.01, 252), frequency: "daily", nTrials: 1 });
    expect(r.dsr).toBeGreaterThan(0.99);
    expect(r.verdict).toBe("green");
  });

  it("yellow: moderate edge, DSR between 0.5 and 0.95", () => {
    // SR_hat - 0 ~= 1 / sqrt(T-1) -> PSR ~= Phi(1) ~= 0.84
    const r = runBacktestCheck({ returns: alternating(0.000632, 0.01, 252), frequency: "daily", nTrials: 1 });
    expect(r.dsr).toBeGreaterThan(0.5);
    expect(r.dsr).toBeLessThan(0.95);
    expect(r.verdict).toBe("yellow");
  });

  it("red: tiny edge after 1000 trials", () => {
    const r = runBacktestCheck({ returns: alternating(0.0001, 0.01, 252), frequency: "daily", nTrials: 1000 });
    expect(r.dsr).toBeLessThan(0.5);
    expect(r.verdict).toBe("red");
    expect(r.benchmarkSR).toBeCloseTo(expectedMaxSharpeRatio(1000, Math.sqrt(nullHypothesisV(252))), 12);
  });

  it("the same series gets worse as N grows", () => {
    const returns = alternating(0.001, 0.01, 504);
    const few = runBacktestCheck({ returns, frequency: "daily", nTrials: 2 });
    const many = runBacktestCheck({ returns, frequency: "daily", nTrials: 500 });
    expect(many.dsr).toBeLessThan(few.dsr);
  });

  it("negative Sharpe is red with a warning", () => {
    const r = runBacktestCheck({ returns: alternating(-0.002, 0.01, 252), frequency: "daily", nTrials: 5 });
    expect(r.verdict).toBe("red");
    expect(r.warnings.join(" ")).toMatch(/not positive/);
  });

  it("uses measured V when given and does not flag it as estimated", () => {
    const returns = alternating(0.002, 0.01, 252);
    const est = runBacktestCheck({ returns, frequency: "daily", nTrials: 50 });
    const meas = runBacktestCheck({ returns, frequency: "daily", nTrials: 50, varianceOfTrialSharpes: 0.01 });
    expect(meas.vEstimated).toBe(false);
    expect(meas.vUsed).toBe(0.01);
    expect(meas.dsr).toBeLessThan(est.dsr); // larger V -> higher benchmark
    expect(meas.warnings.join(" ")).not.toMatch(/estimated/);
    expect(est.warnings.join(" ")).toMatch(/estimated/);
  });

  it("annualizes by frequency, including custom", () => {
    const returns = alternating(0.005, 0.01, 120);
    const monthly = runBacktestCheck({ returns, frequency: "monthly", nTrials: 1 });
    const weekly = runBacktestCheck({ returns, frequency: "weekly", nTrials: 1 });
    const custom = runBacktestCheck({ returns, frequency: "custom", customPeriodsPerYear: 12, nTrials: 1 });
    expect(monthly.periodsPerYear).toBe(12);
    expect(weekly.periodsPerYear).toBe(52);
    expect(monthly.sharpe).toBeCloseTo(weekly.sharpe, 12); // per-period Sharpe doesn't depend on frequency
    expect(custom.sharpeAnnualized).toBeCloseTo(monthly.sharpeAnnualized, 12);
  });
});

describe("runBacktestCheck - warnings", () => {
  it("warns when T < 60", () => {
    const r = runBacktestCheck({ returns: alternating(0.005, 0.01, 30), frequency: "monthly", nTrials: 3 });
    expect(r.warnings.join(" ")).toMatch(/Only 30 observations/);
  });

  it("no short-series warning at T = 60", () => {
    const r = runBacktestCheck({ returns: alternating(0.005, 0.01, 60), frequency: "monthly", nTrials: 3 });
    expect(r.warnings.join(" ")).not.toMatch(/Only 60/);
  });

  it("warns when values look like percent instead of decimals", () => {
    const pct = alternating(0.5, 1.2, 252); // percent numbers: 0.5 % mean, 1.2 % swings
    const r = runBacktestCheck({ returns: pct, frequency: "daily", nTrials: 1 });
    expect(r.warnings.join(" ")).toMatch(/percent/);
    const dec = runBacktestCheck({ returns: pct.map((x) => x / 100), frequency: "daily", nTrials: 1 });
    expect(dec.warnings.join(" ")).not.toMatch(/percent/);
    // Sharpe is scale-invariant, so the result is identical
    expect(dec.dsr).toBeCloseTo(r.dsr, 10);
  });

  it("warns for N = 1", () => {
    const r = runBacktestCheck({ returns: alternating(0.005, 0.01, 252), frequency: "daily", nTrials: 1 });
    expect(r.warnings.join(" ")).toMatch(/N = 1/);
  });

  it("warns about default skew/kurtosis when T = 3", () => {
    const r = runBacktestCheck({ returns: [0.01, -0.005, 0.02], frequency: "daily", nTrials: 1 });
    expect(r.warnings.join(" ")).toMatch(/Fewer than 4/);
  });
});

describe("runBacktestCheck - edge cases", () => {
  const ok = alternating(0.005, 0.01, 252);

  it("rejects an empty series", () => {
    expect(() => runBacktestCheck({ returns: [], frequency: "daily", nTrials: 1 })).toThrow(CheckInputError);
    expect(() => runBacktestCheck({ returns: [], frequency: "daily", nTrials: 1 })).toThrow(/empty/);
  });

  it("rejects a single observation", () => {
    expect(() => runBacktestCheck({ returns: [0.01], frequency: "daily", nTrials: 1 })).toThrow(/At least 2/);
  });

  it("rejects constant series (std = 0), including float-noise constants", () => {
    expect(() => runBacktestCheck({ returns: Array(100).fill(0.01), frequency: "daily", nTrials: 1 })).toThrow(/identical/);
    expect(() => runBacktestCheck({ returns: Array(100).fill(0), frequency: "daily", nTrials: 1 })).toThrow(/identical/);
    expect(() => runBacktestCheck({ returns: Array(100).fill(0.1), frequency: "daily", nTrials: 1 })).toThrow(/identical/);
  });

  it("rejects NaN / Infinity in the series", () => {
    expect(() => runBacktestCheck({ returns: [...ok, NaN], frequency: "daily", nTrials: 1 })).toThrow(CheckInputError);
    expect(() => runBacktestCheck({ returns: [...ok, Infinity], frequency: "daily", nTrials: 1 })).toThrow(CheckInputError);
  });

  it("rejects bad N", () => {
    for (const n of [0, -3, 2.5, NaN, Infinity]) {
      expect(() => runBacktestCheck({ returns: ok, frequency: "daily", nTrials: n })).toThrow(/whole number/);
    }
  });

  it("rejects bad V and bad custom periods", () => {
    expect(() => runBacktestCheck({ returns: ok, frequency: "daily", nTrials: 5, varianceOfTrialSharpes: -1 })).toThrow(/V/);
    expect(() => runBacktestCheck({ returns: ok, frequency: "custom", nTrials: 5 })).toThrow(/Periods per year/);
    expect(() =>
      runBacktestCheck({ returns: ok, frequency: "custom", customPeriodsPerYear: 0, nTrials: 5 }),
    ).toThrow(/Periods per year/);
  });

  it("two observations work (minimum)", () => {
    const r = runBacktestCheck({ returns: [0.02, -0.01], frequency: "daily", nTrials: 1 });
    expect(r.T).toBe(2);
    expect(Number.isFinite(r.dsr)).toBe(true);
  });
});
