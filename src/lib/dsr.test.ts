import { describe, expect, it } from "vitest";
import {
  annualizedToPerPeriodSharpe,
  perPeriodToAnnualizedSharpe,
  deflatedSharpeRatio,
  excessKurtosisToNonExcess,
  expectedMaxSharpeRatio,
  kurtosis,
  nullHypothesisV,
  probabilisticSharpeRatio,
  skewness,
  varianceOfSharpeRatios,
} from "./dsr";
import { normCdf, normPpf } from "./normal";
import referenceValuesVUnknown from "../../tools/reference_values.json";
import referenceValuesVMeasured from "../../tools/reference_values_v_measured.json";

const TOLERANCE = 1e-6;

describe("normal distribution helpers", () => {
  it("normCdf(0) = 0.5", () => {
    // erfc approximation used here is accurate to ~1.5e-7, not machine
    // precision - see normal.ts's docstring.
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
  });

  it("normCdf matches known values", () => {
    expect(normCdf(1.959963985)).toBeCloseTo(0.975, 6);
    expect(normCdf(-1.959963985)).toBeCloseTo(0.025, 6);
  });

  it("normPpf is the inverse of normCdf", () => {
    for (const p of [0.001, 0.025, 0.1, 0.5, 0.9, 0.975, 0.999]) {
      const x = normPpf(p);
      expect(normCdf(x)).toBeCloseTo(p, 6);
    }
  });

  it("normPpf(0.5) = 0", () => {
    expect(normPpf(0.5)).toBeCloseTo(0, 10);
  });
});

describe("frequency conversion", () => {
  it("annualized -> per-period -> annualized round-trips", () => {
    const annualized = 1.5;
    const perPeriod = annualizedToPerPeriodSharpe(annualized, 252);
    expect(perPeriodToAnnualizedSharpe(perPeriod, 252)).toBeCloseTo(annualized, 10);
  });

  it("daily annualized 1.0 gives per-period ~0.06299", () => {
    expect(annualizedToPerPeriodSharpe(1.0, 252)).toBeCloseTo(1 / Math.sqrt(252), 10);
  });
});

describe("kurtosis conventions", () => {
  it("excess 0 -> non-excess 3 (normal distribution)", () => {
    expect(excessKurtosisToNonExcess(0)).toBe(3);
  });
});

describe("skewness/kurtosis population-moment estimator", () => {
  it("symmetric data has ~0 skewness", () => {
    const data = [-2, -1, 0, 1, 2];
    expect(skewness(data)).toBeCloseTo(0, 10);
  });

  it("returns 3 (non-excess) for uniform-ish small samples below n<4", () => {
    expect(kurtosis([1, 2])).toBe(3);
  });
});

describe("expectedMaxSharpeRatio", () => {
  it("returns 0 for nTrials = 1 (no multiple-testing correction)", () => {
    expect(expectedMaxSharpeRatio(1, 0.05)).toBe(0);
  });

  it("increases with nTrials for fixed sqrtV", () => {
    const sr7 = expectedMaxSharpeRatio(7, 0.05);
    const sr50 = expectedMaxSharpeRatio(50, 0.05);
    const sr200 = expectedMaxSharpeRatio(200, 0.05);
    expect(sr50).toBeGreaterThan(sr7);
    expect(sr200).toBeGreaterThan(sr50);
  });
});

describe("varianceOfSharpeRatios", () => {
  it("matches a hand-computed sample variance", () => {
    const xs = [0.1, 0.2, 0.3, 0.4, 0.5];
    const mean = 0.3;
    const expected = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
    expect(varianceOfSharpeRatios(xs)).toBeCloseTo(expected, 12);
  });

  it("returns 0 for fewer than 2 values", () => {
    expect(varianceOfSharpeRatios([0.5])).toBe(0);
  });
});

describe("N=1 behavior: DSR reduces to PSR against 0", () => {
  it("deflatedSharpeRatio(N=1) equals probabilisticSharpeRatio(observedSR, 0, ...)", () => {
    const observedSR = 0.08;
    const nObs = 400;
    const skew = 0.1;
    const kurt = 4.0;
    const result = deflatedSharpeRatio({ observedSR, nTrials: 1, nObs, skew, kurt });
    const expected = probabilisticSharpeRatio(observedSR, 0, nObs, skew, kurt);
    expect(result.deflatedSharpeRatio).toBeCloseTo(expected, 10);
    expect(result.benchmarkSR).toBe(0);
  });
});

describe("V unknown mode matches the reference Python implementation exactly", () => {
  const cases = referenceValuesVUnknown as Array<{
    observed_sr: number;
    n_trials: number;
    n_obs: number;
    skew: number;
    kurt: number;
    deflated_sharpe_ratio: number;
  }>;

  it.each(cases)(
    "SR=$observed_sr N=$n_trials T=$n_obs skew=$skew kurt=$kurt",
    (c) => {
      const result = deflatedSharpeRatio({
        observedSR: c.observed_sr,
        nTrials: c.n_trials,
        nObs: c.n_obs,
        skew: c.skew,
        kurt: c.kurt,
        // V unknown mode: rely on the nullHypothesisV(nObs) fallback,
        // which is exactly what the Python repo's implementation uses.
      });
      expect(result.vWasApproximated).toBe(true);
      expect(result.vUsed).toBeCloseTo(nullHypothesisV(c.n_obs), 12);
      expect(result.deflatedSharpeRatio).toBeCloseTo(c.deflated_sharpe_ratio, TOLERANCE === 1e-6 ? 6 : 10);
    },
  );
});

describe("V measured mode matches an independent scipy implementation", () => {
  const cases = referenceValuesVMeasured as Array<{
    observed_sr: number;
    n_trials: number;
    n_obs: number;
    v: number;
    skew: number;
    kurt: number;
    deflated_sharpe_ratio: number;
  }>;

  it.each(cases)(
    "SR=$observed_sr N=$n_trials T=$n_obs V=$v skew=$skew kurt=$kurt",
    (c) => {
      const result = deflatedSharpeRatio({
        observedSR: c.observed_sr,
        nTrials: c.n_trials,
        nObs: c.n_obs,
        skew: c.skew,
        kurt: c.kurt,
        varianceOfTrialSharpes: c.v,
      });
      expect(result.vWasApproximated).toBe(false);
      expect(result.vUsed).toBeCloseTo(c.v, 12);
      expect(result.deflatedSharpeRatio).toBeCloseTo(c.deflated_sharpe_ratio, 6);
    },
  );
});

describe("edge cases", () => {
  it("N=1 gives DSR = PSR against 0 (no deflation)", () => {
    const result = deflatedSharpeRatio({ observedSR: 0.1, nTrials: 1, nObs: 300 });
    expect(result.benchmarkSR).toBe(0);
  });

  it("very large N pushes DSR toward 0 for a fixed modest Sharpe", () => {
    const small = deflatedSharpeRatio({ observedSR: 0.05, nTrials: 10, nObs: 500 });
    const huge = deflatedSharpeRatio({ observedSR: 0.05, nTrials: 1_000_000, nObs: 500 });
    expect(huge.deflatedSharpeRatio).toBeLessThan(small.deflatedSharpeRatio);
  });

  it("negative Sharpe gives a very low DSR", () => {
    const result = deflatedSharpeRatio({ observedSR: -0.5, nTrials: 10, nObs: 252 });
    expect(result.deflatedSharpeRatio).toBeLessThan(0.01);
  });

  it("high kurtosis is accepted and changes the result vs normal kurtosis", () => {
    const normalKurt = deflatedSharpeRatio({ observedSR: 0.1, nTrials: 20, nObs: 300, kurt: 3 });
    const highKurt = deflatedSharpeRatio({ observedSR: 0.1, nTrials: 20, nObs: 300, kurt: 15 });
    expect(highKurt.deflatedSharpeRatio).not.toBeCloseTo(normalKurt.deflatedSharpeRatio, 6);
  });

  it("throws for nObs <= 1", () => {
    expect(() => deflatedSharpeRatio({ observedSR: 0.1, nTrials: 5, nObs: 1 })).toThrow();
  });

  it("throws for nTrials < 1", () => {
    expect(() => deflatedSharpeRatio({ observedSR: 0.1, nTrials: 0, nObs: 300 })).toThrow();
  });

  it("throws for negative variance", () => {
    expect(() =>
      deflatedSharpeRatio({ observedSR: 0.1, nTrials: 5, nObs: 300, varianceOfTrialSharpes: -1 }),
    ).toThrow();
  });
});
