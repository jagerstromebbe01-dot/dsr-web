"""
Independent reference implementation of the full Deflated Sharpe Ratio
formula, with V (variance of the tried strategies' per-period Sharpe
ratios) as an explicit input parameter rather than approximated from T.

Written from scratch against Bailey & Lopez de Prado (2014) directly -
does not import or read any external code. Used only to cross-check the
TypeScript implementation's "V measured" mode (src/lib/dsr.ts:
deflatedSharpeRatio() with varianceOfTrialSharpes set).

Output written only inside dsr-web/.
"""

from __future__ import annotations

import json
import math
import os

from scipy.stats import norm

EULER_MASCHERONI = 0.5772156649015328606
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "reference_values_v_measured.json")


def expected_max_sharpe_ratio(n_trials: int, sqrt_v: float) -> float:
    if n_trials < 2:
        return 0.0
    return sqrt_v * (
        (1 - EULER_MASCHERONI) * norm.ppf(1 - 1.0 / n_trials)
        + EULER_MASCHERONI * norm.ppf(1 - 1.0 / (n_trials * math.e))
    )


def probabilistic_sharpe_ratio(
    observed_sr: float, benchmark_sr: float, n_obs: int, skew: float, kurt: float
) -> float:
    denom = math.sqrt(1 - skew * observed_sr + (kurt - 1) / 4 * observed_sr**2)
    z = (observed_sr - benchmark_sr) * math.sqrt(n_obs - 1) / denom
    return float(norm.cdf(z))


def deflated_sharpe_ratio_with_v(
    observed_sr: float, n_trials: int, n_obs: int, v: float, skew: float = 0.0, kurt: float = 3.0
) -> float:
    benchmark_sr = expected_max_sharpe_ratio(n_trials, math.sqrt(v))
    return probabilistic_sharpe_ratio(observed_sr, benchmark_sr, n_obs, skew, kurt)


def main() -> None:
    # Five distinct V values, plus varied N/T/skew/kurtosis/Sharpe to
    # exercise the "V measured" code path independently of the T-derived
    # approximation used in "V unknown" mode.
    cases = [
        {"observed_sr": 0.07, "n_trials": 20, "n_obs": 500, "v": 0.0005, "skew": 0.0, "kurt": 3.0},
        {"observed_sr": 0.10, "n_trials": 112, "n_obs": 3654, "v": 0.002, "skew": -0.4, "kurt": 6.5},
        {"observed_sr": -0.05, "n_trials": 30, "n_obs": 252, "v": 0.01, "skew": 0.2, "kurt": 4.0},
        {"observed_sr": 0.03, "n_trials": 500, "n_obs": 1000, "v": 0.0001, "skew": 0.0, "kurt": 3.0},
        {"observed_sr": 0.20, "n_trials": 3, "n_obs": 60, "v": 0.05, "skew": 1.0, "kurt": 8.0},
    ]

    results = []
    for case in cases:
        dsr = deflated_sharpe_ratio_with_v(**case)
        results.append({**case, "deflated_sharpe_ratio": dsr})

    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=2)

    print(f"Wrote {len(results)} V-measured reference cases to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
