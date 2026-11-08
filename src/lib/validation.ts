/**
 * Input validation for the DSR calculator UI. Returns a human-readable
 * error message, or null if the input is valid.
 */

export function validateNObs(nObs: number): string | null {
  if (!Number.isFinite(nObs)) return "Number of observations must be a number.";
  if (nObs <= 1) return "Number of observations (T) must be greater than 1.";
  return null;
}

export function validateNTrials(nTrials: number): string | null {
  if (!Number.isFinite(nTrials)) return "Number of trials must be a number.";
  if (nTrials < 1) return "Number of trials (N) must be at least 1.";
  if (!Number.isInteger(nTrials)) return "Number of trials (N) must be a whole number.";
  return null;
}

export function validateVariance(v: number): string | null {
  if (!Number.isFinite(v)) return "Variance must be a number.";
  if (v < 0) return "Variance (V) cannot be negative.";
  return null;
}

export function validateSharpe(sr: number, label = "Sharpe ratio"): string | null {
  if (!Number.isFinite(sr)) return `${label} must be a number.`;
  return null;
}

/** Takes kurtosis in the NON-EXCESS convention (normal = 3). Mathematically
 * kurtosis can never be below 1 (excess: -2), so anything lower is a typo
 * or a convention mix-up. */
export function validateKurtosis(kurt: number): string | null {
  if (!Number.isFinite(kurt)) return "Kurtosis must be a number.";
  if (kurt < 1) {
    return "Kurtosis cannot be below 1 (non-excess convention, normal = 3) — equivalent to −2 in the excess convention (normal = 0). Check the value and the convention you selected.";
  }
  return null;
}

/** Parses the skewness text field. An empty field means 0 (normal
 * distribution) and is flagged via `note` so the UI can say so; anything
 * else that is not a finite number is an error instead of silently 0. */
export function parseSkewInput(raw: string): {
  value: number;
  error: string | null;
  note: string | null;
} {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { value: 0, error: null, note: "Skewness field is empty — using 0 (symmetric, like a normal distribution)." };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { value: NaN, error: "Skewness must be a number (e.g. -0.4 or 0.2).", note: null };
  }
  return { value, error: null, note: null };
}

/** Checks the term under the square root in the PSR denominator stays
 * positive for the given inputs - an extreme skew/kurtosis/Sharpe
 * combination can otherwise make the formula undefined. */
export function validateDenominator(
  observedSR: number,
  skew: number,
  kurt: number,
): string | null {
  const denomInner = 1 - skew * observedSR + ((kurt - 1) / 4) * observedSR ** 2;
  if (denomInner <= 0) {
    return "This combination of Sharpe ratio, skewness and kurtosis makes the formula's denominator zero or negative - try more moderate values.";
  }
  return null;
}

export function validatePastedSharpeCount(
  parsedCount: number,
  nTrials: number,
): string | null {
  if (parsedCount < nTrials) {
    return `You pasted ${parsedCount} Sharpe ratio(s), but N is set to ${nTrials}. The variance estimate below is based on only ${parsedCount} value(s), not the full ${nTrials} trials - treat it as approximate.`;
  }
  return null;
}
