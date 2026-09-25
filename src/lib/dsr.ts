/**
 * Deflated Sharpe Ratio (DSR) - Bailey & Lopez de Prado (2014),
 * "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest
 * Overfitting, and Non-Normality".
 *
 * All Sharpe ratios in this module are PER PERIOD (e.g. daily), never
 * annualized - see toPerPeriodSharpe() to convert before calling these.
 *
 * Kurtosis convention: NON-EXCESS (a normal distribution has kurtosis 3,
 * not 0) - see excessKurtosisToNonExcess() if converting user input.
 */

import { normCdf, normPpf } from "./normal";

export const EULER_MASCHERONI = 0.5772156649015328606;

export type DataFrequency = "daily" | "daily_crypto" | "weekly" | "monthly" | "custom";

export const PERIODS_PER_YEAR: Record<Exclude<DataFrequency, "custom">, number> = {
  daily: 252,
  daily_crypto: 365,
  weekly: 52,
  monthly: 12,
};

/** Converts an annualized Sharpe ratio to per-period, given periods/year.
 * SR_per_period = SR_annualized / sqrt(periods_per_year). */
export function annualizedToPerPeriodSharpe(
  srAnnualized: number,
  periodsPerYear: number,
): number {
  return srAnnualized / Math.sqrt(periodsPerYear);
}

/** Converts a per-period Sharpe ratio to annualized, given periods/year. */
export function perPeriodToAnnualizedSharpe(
  srPerPeriod: number,
  periodsPerYear: number,
): number {
  return srPerPeriod * Math.sqrt(periodsPerYear);
}

/** Converts excess kurtosis (normal = 0) to non-excess (normal = 3),
 * the convention this module's formulas expect. */
export function excessKurtosisToNonExcess(excessKurtosis: number): number {
  return excessKurtosis + 3;
}

/** Converts non-excess kurtosis (normal = 3) to excess (normal = 0). */
export function nonExcessKurtosisToExcess(kurtosis: number): number {
  return kurtosis - 3;
}

/**
 * Sample skewness (gamma3), population-moment estimator: numerator and
 * denominator both use the same n divisor (not Bessel-corrected). Same
 * convention as the reference Python implementation this was verified
 * against.
 */
export function skewness(returns: number[]): number {
  const n = returns.length;
  if (n < 3) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const s = Math.sqrt(variance);
  if (s === 0) return 0;
  const m3 = returns.reduce((a, b) => a + (b - mean) ** 3, 0) / n;
  return m3 / s ** 3;
}

/**
 * Sample kurtosis (gamma4), NON-EXCESS (normal distribution = 3.0).
 * Population-moment estimator, same convention as skewness() above.
 */
export function kurtosis(returns: number[]): number {
  const n = returns.length;
  if (n < 4) return 3;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const s = Math.sqrt(variance);
  if (s === 0) return 3;
  const m4 = returns.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
  return m4 / s ** 4;
}

/**
 * Sample variance of a list of (per-period) Sharpe ratios across N
 * independently tested strategies/variants - this is "V" in the DSR
 * formula when it is measured rather than approximated. Uses the
 * unbiased (n-1) estimator.
 */
export function varianceOfSharpeRatios(sharpeRatios: number[]): number {
  const n = sharpeRatios.length;
  if (n < 2) return 0;
  const mean = sharpeRatios.reduce((a, b) => a + b, 0) / n;
  return sharpeRatios.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
}

/**
 * Expected maximum Sharpe ratio among N independent trials, under the
 * null hypothesis that none of them has genuine edge (SR*_0 in Bailey &
 * Lopez de Prado). This is the benchmark DSR actually measures the
 * observed Sharpe against - not zero.
 *
 * nTrials: N, total number of tested variants (including this one).
 * sqrtV:   sqrt(V), the standard deviation of the (per-period) Sharpe
 *          ratio across trials - see varianceOfSharpeRatios() or the
 *          V-unknown approximation in nullHypothesisV().
 */
export function expectedMaxSharpeRatio(nTrials: number, sqrtV: number): number {
  if (nTrials < 2) {
    // With a single trial there is no multiple-testing correction to
    // make - the expected max is zero by definition (no search).
    return 0;
  }
  return (
    sqrtV *
    ((1 - EULER_MASCHERONI) * normPpf(1 - 1 / nTrials) +
      EULER_MASCHERONI * normPpf(1 - 1 / (nTrials * Math.E)))
  );
}

/**
 * "V unknown" approximation: the variance of the Sharpe ratio estimator
 * itself, evaluated at SR = 0 (skew/kurtosis terms vanish there),
 * i.e. V = 1 / (T - 1). This is the standard fallback when the actual
 * cross-sectional variance of the K tried strategies' Sharpe ratios is
 * not available - it implicitly treats "the typical tried strategy" as
 * pure noise around SR = 0. This is exactly what the reference Python
 * implementation this project's "V unknown" mode was verified against uses
 * (see tools/gen_reference_values.py).
 */
export function nullHypothesisV(nObs: number): number {
  if (nObs < 2) throw new RangeError("nullHypothesisV: nObs must be >= 2");
  return 1 / (nObs - 1);
}

/**
 * Probabilistic Sharpe Ratio: PSR(SR*) = Phi( (SR_hat - SR*) * sqrt(T-1)
 * / sqrt(1 - gamma3*SR_hat + ((gamma4-1)/4)*SR_hat^2) )
 *
 * The probability that the true Sharpe ratio exceeds a benchmark SR*,
 * given the observed per-period Sharpe SR_hat, T observations, and the
 * return series' skewness/kurtosis.
 */
export function probabilisticSharpeRatio(
  observedSR: number,
  benchmarkSR: number,
  nObs: number,
  skew: number,
  kurt: number,
): number {
  if (nObs < 2) throw new RangeError("probabilisticSharpeRatio: nObs must be >= 2");
  const denomInner = 1 - skew * observedSR + ((kurt - 1) / 4) * observedSR ** 2;
  if (denomInner <= 0) {
    throw new RangeError(
      "probabilisticSharpeRatio: denominator is non-positive (extreme skew/kurtosis/Sharpe combination) - check inputs",
    );
  }
  const denom = Math.sqrt(denomInner);
  const z = ((observedSR - benchmarkSR) * Math.sqrt(nObs - 1)) / denom;
  return normCdf(z);
}

export interface DeflatedSharpeInput {
  /** Observed, per-period (NOT annualized) Sharpe ratio of the strategy being evaluated. */
  observedSR: number;
  /** N, total number of independently tested strategies/variants (including this one). Must be >= 1. */
  nTrials: number;
  /** T, number of return observations in the backtest. Must be > 1. */
  nObs: number;
  /** Sample skewness (gamma3) of the same return series observedSR was computed on. Default 0 (normal). */
  skew?: number;
  /** Sample kurtosis (gamma4), NON-EXCESS convention (normal = 3). Default 3 (normal). */
  kurt?: number;
  /** Variance of the (per-period) Sharpe ratios across the N tried strategies. If omitted, falls back to nullHypothesisV(nObs). */
  varianceOfTrialSharpes?: number;
}

export interface DeflatedSharpeResult {
  deflatedSharpeRatio: number;
  benchmarkSR: number;
  vUsed: number;
  vWasApproximated: boolean;
}

/**
 * Computes DSR: the probability (0-1) that the observed per-period
 * Sharpe is genuinely > 0, after correcting for having searched through
 * nTrials variants and for the return series' skewness/kurtosis
 * deviating from normal.
 *
 * A common threshold is DSR > 0.95 ("95% likely genuine edge given N
 * trials"), but the exact threshold is a modelling choice, not hardcoded
 * here.
 */
export function deflatedSharpeRatio(input: DeflatedSharpeInput): DeflatedSharpeResult {
  const { observedSR, nTrials, nObs, skew = 0, kurt = 3 } = input;

  if (nObs < 2) throw new RangeError("deflatedSharpeRatio: nObs must be >= 2");
  if (nTrials < 1) throw new RangeError("deflatedSharpeRatio: nTrials must be >= 1");

  const vWasApproximated = input.varianceOfTrialSharpes === undefined;
  const v = vWasApproximated ? nullHypothesisV(nObs) : input.varianceOfTrialSharpes!;
  if (v < 0) throw new RangeError("deflatedSharpeRatio: variance must be >= 0");

  const benchmarkSR = expectedMaxSharpeRatio(nTrials, Math.sqrt(v));
  const dsr = probabilisticSharpeRatio(observedSR, benchmarkSR, nObs, skew, kurt);

  return { deflatedSharpeRatio: dsr, benchmarkSR, vUsed: v, vWasApproximated };
}
