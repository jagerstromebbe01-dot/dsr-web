/**
 * Backtest check: from a raw return series + number of tried strategies to
 * a green / yellow / red verdict. Pure functions, no React or DOM, so the
 * same code can later run in an API.
 *
 * Conventions (same as dsr.ts):
 *  - Sharpe inside the formulas is PER PERIOD (mean / sample std, n-1).
 *  - Skewness and kurtosis are population-moment estimators, kurtosis is
 *    NON-EXCESS (normal = 3).
 *  - Returns are DECIMAL per-period returns (0.01 = 1 %).
 */

import {
  PERIODS_PER_YEAR,
  deflatedSharpeRatio,
  kurtosis,
  perPeriodToAnnualizedSharpe,
  skewness,
} from "./dsr";
import type { DataFrequency } from "./dsr";

export type Verdict = "green" | "yellow" | "red";

/** DSR >= GREEN_THRESHOLD is green, >= YELLOW_THRESHOLD is yellow, below is red. */
export const GREEN_THRESHOLD = 0.95;
export const YELLOW_THRESHOLD = 0.5;

/** Below this many observations a warning is added. */
export const MIN_RECOMMENDED_T = 60;

export interface CheckInput {
  /** Per-period returns as decimals (0.01 = 1 %). */
  returns: number[];
  frequency: DataFrequency;
  /** Only used when frequency is "custom". */
  customPeriodsPerYear?: number;
  /** N: number of INDEPENDENT strategies tried (including this one). Whole number >= 1. */
  nTrials: number;
  /** Optional measured variance of the per-period Sharpe ratios of the N trials. If omitted, V is estimated as 1/(T-1). */
  varianceOfTrialSharpes?: number;
}

export interface CheckResult {
  dsr: number;
  verdict: Verdict;
  /** Per-period Sharpe (mean / sample std). */
  sharpe: number;
  sharpeAnnualized: number;
  skew: number;
  /** Non-excess kurtosis (normal = 3). */
  kurtosis: number;
  T: number;
  N: number;
  vEstimated: boolean;
  vUsed: number;
  /** Per-period expected-max Sharpe under pure luck (SR*0). */
  benchmarkSR: number;
  periodsPerYear: number;
  warnings: string[];
}

/** Thrown for input that cannot be checked at all (as opposed to warnings). */
export class CheckInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckInputError";
  }
}

export function verdictFromDsr(dsr: number): Verdict {
  if (dsr >= GREEN_THRESHOLD) return "green";
  if (dsr >= YELLOW_THRESHOLD) return "yellow";
  return "red";
}

export function periodsPerYearFor(frequency: DataFrequency, custom?: number): number {
  if (frequency === "custom") {
    if (custom === undefined || !Number.isFinite(custom) || custom <= 0) {
      throw new CheckInputError("Periods per year must be a positive number.");
    }
    return custom;
  }
  return PERIODS_PER_YEAR[frequency];
}

export function runBacktestCheck(input: CheckInput): CheckResult {
  const { returns, frequency, nTrials } = input;
  const T = returns.length;

  if (T === 0) throw new CheckInputError("The return series is empty.");
  if (T < 2) throw new CheckInputError("At least 2 observations are needed (you gave 1).");
  if (returns.some((r) => !Number.isFinite(r))) {
    throw new CheckInputError("The return series contains values that are not numbers.");
  }
  if (!Number.isFinite(nTrials) || !Number.isInteger(nTrials) || nTrials < 1) {
    throw new CheckInputError("N (number of tried strategies) must be a whole number, at least 1.");
  }
  if (input.varianceOfTrialSharpes !== undefined) {
    if (!Number.isFinite(input.varianceOfTrialSharpes) || input.varianceOfTrialSharpes < 0) {
      throw new CheckInputError("V (variance of the tried Sharpe ratios) must be a number >= 0.");
    }
  }
  const periodsPerYear = periodsPerYearFor(frequency, input.customPeriodsPerYear);

  const mean = returns.reduce((a, b) => a + b, 0) / T;
  const sampleVar = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (T - 1);
  const std = Math.sqrt(sampleVar);
  // Constant series: guard against rounding noise (e.g. 0.1 repeated) as well as exact zero.
  if (std === 0 || std <= Math.abs(mean) * 1e-12) {
    throw new CheckInputError(
      "All returns are identical (standard deviation is 0), so a Sharpe ratio cannot be calculated.",
    );
  }

  const sharpe = mean / std;
  const skew = skewness(returns);
  const kurt = kurtosis(returns);

  let ddsr;
  try {
    ddsr = deflatedSharpeRatio({
      observedSR: sharpe,
      nTrials,
      nObs: T,
      skew,
      kurt,
      varianceOfTrialSharpes: input.varianceOfTrialSharpes,
    });
  } catch (e) {
    throw new CheckInputError(
      e instanceof Error
        ? `The statistics of this series make the DSR undefined: ${e.message}`
        : "The statistics of this series make the DSR undefined.",
    );
  }

  const warnings: string[] = [];
  if (T < MIN_RECOMMENDED_T) {
    warnings.push(
      `Only ${T} observations. With fewer than ${MIN_RECOMMENDED_T}, Sharpe, skewness and kurtosis are very uncertain — treat the verdict with caution.`,
    );
  }
  if (T < 4) {
    warnings.push("Fewer than 4 observations: skewness and kurtosis cannot be estimated and default to a normal distribution.");
  }
  if (ddsr.vWasApproximated) {
    warnings.push(
      "V (the spread of Sharpe ratios across your tried strategies) is estimated as 1/(T−1), assuming the other strategies were pure noise. The result is an estimate.",
    );
  }
  const maxAbs = returns.reduce((m, r) => Math.max(m, Math.abs(r)), 0);
  if (maxAbs > 1) {
    warnings.push(
      "Some values are larger than 1 (= 100 % in one period). Are your returns in percent instead of decimals? If so, divide by 100 first (the Sharpe ratio itself is unaffected, but this often signals the wrong column).",
    );
  }
  if (nTrials === 1) {
    warnings.push("N = 1: no multiple-testing correction is applied. Be honest — did you really try only this one strategy?");
  }
  if (sharpe <= 0) {
    warnings.push("The Sharpe ratio is not positive, so there is no edge to test.");
  }

  return {
    dsr: ddsr.deflatedSharpeRatio,
    verdict: verdictFromDsr(ddsr.deflatedSharpeRatio),
    sharpe,
    sharpeAnnualized: perPeriodToAnnualizedSharpe(sharpe, periodsPerYear),
    skew,
    kurtosis: kurt,
    T,
    N: nTrials,
    vEstimated: ddsr.vWasApproximated,
    vUsed: ddsr.vUsed,
    benchmarkSR: ddsr.benchmarkSR,
    periodsPerYear,
    warnings,
  };
}
