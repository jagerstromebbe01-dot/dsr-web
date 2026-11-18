import { describe, expect, it } from "vitest";
import { CheckInputError, runBacktestCheck } from "./check";
import { runStatsCheck } from "./checkFromStats";
import { annualizedToPerPeriodSharpe, deflatedSharpeRatio } from "./dsr";

const base = { sharpe: 1.5, sharpeIsAnnual: true, frequency: "daily" as const, T: 1260, nTrials: 50 };

describe("runStatsCheck", () => {
  it("matches deflatedSharpeRatio() with the annual Sharpe converted to per period", () => {
    const r = runStatsCheck(base);
    const d = deflatedSharpeRatio({ observedSR: annualizedToPerPeriodSharpe(1.5, 252), nTrials: 50, nObs: 1260 });
    expect(r.dsr).toBeCloseTo(d.deflatedSharpeRatio, 12);
    expect(r.benchmarkSR).toBeCloseTo(d.benchmarkSR, 12);
    expect(r.sharpeAnnualized).toBeCloseTo(1.5, 12);
    expect(r.vEstimated).toBe(true);
    expect(r.periodsPerYear).toBe(252);
  });

  it("agrees with runBacktestCheck when given that check's own statistics", () => {
    const returns = Array.from({ length: 504 }, (_, i) => (i % 3 === 0 ? 0.02 : -0.006) + (i % 7) * 0.0003);
    const full = runBacktestCheck({ returns, frequency: "weekly", nTrials: 25 });
    const stats = runStatsCheck({
      sharpe: full.sharpe,
      sharpeIsAnnual: false,
      frequency: "weekly",
      T: full.T,
      nTrials: 25,
      skew: full.skew,
      kurtosis: full.kurtosis,
    });
    expect(stats.dsr).toBeCloseTo(full.dsr, 12);
    expect(stats.verdict).toBe(full.verdict);
  });

  it("annual and per-period input give the same answer", () => {
    const annual = runStatsCheck({ ...base, sharpe: 1.2 });
    const perPeriod = runStatsCheck({ ...base, sharpe: annualizedToPerPeriodSharpe(1.2, 252), sharpeIsAnnual: false });
    expect(perPeriod.dsr).toBeCloseTo(annual.dsr, 12);
  });

  it("uses skew, kurtosis and measured V when given", () => {
    const plain = runStatsCheck(base);
    const fat = runStatsCheck({ ...base, skew: -1, kurtosis: 10, varianceOfTrialSharpes: 0.002 });
    expect(fat.vEstimated).toBe(false);
    expect(fat.vUsed).toBe(0.002);
    expect(fat.dsr).not.toBeCloseTo(plain.dsr, 3);
    expect(fat.warnings.join(" ")).not.toMatch(/assumed normal/);
    expect(plain.warnings.join(" ")).toMatch(/assumed normal/);
  });

  it("verdict follows the thresholds", () => {
    expect(runStatsCheck({ ...base, sharpe: 3, nTrials: 1 }).verdict).toBe("green");
    expect(runStatsCheck({ ...base, sharpe: 0.3, nTrials: 1000, T: 252 }).verdict).toBe("red");
  });

  it("custom frequency needs periods per year", () => {
    expect(() => runStatsCheck({ ...base, frequency: "custom" })).toThrow(/Periods per year/);
    const r = runStatsCheck({ ...base, frequency: "custom", customPeriodsPerYear: 12, T: 120 });
    expect(r.periodsPerYear).toBe(12);
  });

  it("warns for short series, N = 1, non-positive and implausible Sharpe", () => {
    expect(runStatsCheck({ ...base, T: 30 }).warnings.join(" ")).toMatch(/Only 30/);
    expect(runStatsCheck({ ...base, nTrials: 1 }).warnings.join(" ")).toMatch(/N = 1/);
    expect(runStatsCheck({ ...base, sharpe: -0.5 }).warnings.join(" ")).toMatch(/not positive/);
    expect(runStatsCheck({ ...base, sharpe: 9 }).warnings.join(" ")).toMatch(/above 6/);
  });

  it("rejects bad input with CheckInputError", () => {
    const bad = [
      { ...base, sharpe: NaN },
      { ...base, T: 1 },
      { ...base, T: 100.5 },
      { ...base, nTrials: 0 },
      { ...base, nTrials: 2.5 },
      { ...base, kurtosis: 0.5 },
      { ...base, skew: Infinity },
      { ...base, varianceOfTrialSharpes: -1 },
    ];
    for (const b of bad) expect(() => runStatsCheck(b), JSON.stringify(b)).toThrow(CheckInputError);
  });

  it("reports an undefined DSR (extreme skew/kurtosis) as an input error", () => {
    expect(() => runStatsCheck({ ...base, sharpeIsAnnual: false, sharpe: 2, skew: 5, kurtosis: 1 })).toThrow(/undefined/);
  });
});
