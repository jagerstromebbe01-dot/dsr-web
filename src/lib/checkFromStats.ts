/**
 * DSR from summary statistics (no return series): for people who only know
 * their Sharpe ratio, number of observations and number of tried strategies.
 * Pure functions, reuses the existing DSR code.
 */

import { CheckInputError, periodsPerYearFor } from "./check";
import {
  annualizedToPerPeriodSharpe,
  deflatedSharpeRatio,
  perPeriodToAnnualizedSharpe,
} from "./dsr";
import type { DataFrequency } from "./dsr";
import { verdictFromDsr } from "./thresholds";
import type { Verdict } from "./thresholds";
import { validateKurtosis, validateNObs, validateNTrials, validateSharpe, validateVariance } from "./validation";

export interface StatsCheckInput {
  sharpe: number;
  /** true: `sharpe` is annualized; false: it is already per period. */
  sharpeIsAnnual: boolean;
  frequency: DataFrequency;
  /** Only used when frequency is "custom". */
  customPeriodsPerYear?: number;
  /** T: number of return observations behind the Sharpe ratio. */
  T: number;
  /** N: number of INDEPENDENT strategies tried. */
  nTrials: number;
  /** Default 0. */
  skew?: number;
  /** NON-EXCESS kurtosis (normal = 3). Default 3. */
  kurtosis?: number;
  /** Variance of the per-period Sharpe ratios across the trials. Default: estimated as 1/(T-1). */
  varianceOfTrialSharpes?: number;
}

export interface StatsCheckResult {
  dsr: number;
  verdict: Verdict;
  sharpe: number;
  sharpeAnnualized: number;
  skew: number;
  kurtosis: number;
  T: number;
  N: number;
  vEstimated: boolean;
  vUsed: number;
  benchmarkSR: number;
  benchmarkSRAnnualized: number;
  periodsPerYear: number;
  warnings: string[];
}

export function runStatsCheck(input: StatsCheckInput): StatsCheckResult {
  const skew = input.skew ?? 0;
  const kurt = input.kurtosis ?? 3;

  const errors = [
    validateSharpe(input.sharpe, "Sharpe ratio"),
    validateNObs(input.T),
    validateNTrials(input.nTrials),
    validateKurtosis(kurt),
    Number.isFinite(skew) ? null : "Skewness must be a number.",
    input.varianceOfTrialSharpes === undefined ? null : validateVariance(input.varianceOfTrialSharpes),
  ].filter((e): e is string => e !== null);
  if (errors.length > 0) throw new CheckInputError(errors[0]);
  if (!Number.isInteger(input.T)) throw new CheckInputError("Number of observations (T) must be a whole number.");

  const periodsPerYear = periodsPerYearFor(input.frequency, input.customPeriodsPerYear);
  const srPerPeriod = input.sharpeIsAnnual
    ? annualizedToPerPeriodSharpe(input.sharpe, periodsPerYear)
    : input.sharpe;

  let d;
  try {
    d = deflatedSharpeRatio({
      observedSR: srPerPeriod,
      nTrials: input.nTrials,
      nObs: input.T,
      skew,
      kurt,
      varianceOfTrialSharpes: input.varianceOfTrialSharpes,
    });
  } catch (e) {
    throw new CheckInputError(
      e instanceof Error ? `These statistics make the DSR undefined: ${e.message}` : "These statistics make the DSR undefined.",
    );
  }

  const sharpeAnnualized = perPeriodToAnnualizedSharpe(srPerPeriod, periodsPerYear);
  const warnings: string[] = ["The Sharpe ratio was supplied, not calculated from return data, so the result is only as good as that number."];
  if (input.T < 60) warnings.push(`Only ${input.T} observations: the Sharpe ratio is very uncertain.`);
  if (d.vWasApproximated) warnings.push("V is estimated as 1/(T−1), assuming the other strategies were pure noise.");
  if (input.skew === undefined && input.kurtosis === undefined) {
    warnings.push("Skewness and kurtosis were not given, so returns are assumed normal (skew 0, kurtosis 3).");
  }
  if (input.nTrials === 1) warnings.push("N = 1: no multiple-testing correction applied.");
  if (srPerPeriod <= 0) warnings.push("The Sharpe ratio is not positive, so there is no edge to test.");
  if (sharpeAnnualized > 6) warnings.push("An annualized Sharpe above 6 is very unusual — check that it is annualized and uses the right frequency.");

  return {
    dsr: d.deflatedSharpeRatio,
    verdict: verdictFromDsr(d.deflatedSharpeRatio),
    sharpe: srPerPeriod,
    sharpeAnnualized,
    skew,
    kurtosis: kurt,
    T: input.T,
    N: input.nTrials,
    vEstimated: d.vWasApproximated,
    vUsed: d.vUsed,
    benchmarkSR: d.benchmarkSR,
    benchmarkSRAnnualized: perPeriodToAnnualizedSharpe(d.benchmarkSR, periodsPerYear),
    periodsPerYear,
    warnings,
  };
}
