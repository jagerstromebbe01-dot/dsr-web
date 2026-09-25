"""
Generates reference DSR values by reading (never importing) an external
deflated_sharpe_ratio.py implementation and exec()-ing its source in a
private namespace. This deliberately avoids Python's normal import
machinery so nothing is ever written into that external project's folder
(no __pycache__, no .pyc, no module registration) - this script treats
that folder as read-only.

This repo does not vendor that implementation or hardcode where it lives
on disk. Point this script at your own local copy via either:

  - the REFERENCE_DSR_IMPL environment variable, or
  - a command-line argument: python gen_reference_values.py <path>

Example:
  REFERENCE_DSR_IMPL=/path/to/deflated_sharpe_ratio.py python gen_reference_values.py

The referenced file must define a function
deflated_sharpe_ratio(observed_sr, n_trials, n_obs, skew=0.0, kurt=3.0)
matching Bailey & Lopez de Prado (2014)'s formula.

Belt-and-braces: sys.dont_write_bytecode is also set True before
anything else runs, and this script should be invoked with
PYTHONDONTWRITEBYTECODE=1 set in the environment as an extra layer.

All output (reference_values.json) is written ONLY inside dsr-web/.

"V unknown" mode reference values: uses the source implementation's own
approximation (V = 1/(T-1), i.e. sr_std evaluated at SR=0), so these
match its deflated_sharpe_ratio() function exactly.
"""

from __future__ import annotations

import json
import os
import sys

sys.dont_write_bytecode = True

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "reference_values.json")


def resolve_reference_impl_path() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    env_path = os.environ.get("REFERENCE_DSR_IMPL")
    if env_path:
        return env_path
    raise SystemExit(
        "No reference implementation path given. Set REFERENCE_DSR_IMPL "
        "or pass one as the first argument, e.g.:\n"
        "  python gen_reference_values.py /path/to/deflated_sharpe_ratio.py"
    )


def load_repo_module_source(path: str) -> str:
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def exec_in_isolated_namespace(source: str) -> dict:
    namespace: dict = {"__name__": "_dsr_reference_isolated"}
    exec(compile(source, "deflated_sharpe_ratio.py (isolated exec)", "exec"), namespace)
    return namespace


def main() -> None:
    repo_path = os.path.normpath(resolve_reference_impl_path())
    source = load_repo_module_source(repo_path)
    ns = exec_in_isolated_namespace(source)

    deflated_sharpe_ratio = ns["deflated_sharpe_ratio"]

    # (observed_sr, n_trials, n_obs, skew, kurt) - covers the required
    # edge cases: N=1, very large N, negative Sharpe, high kurtosis.
    cases = [
        {"observed_sr": 0.05, "n_trials": 1, "n_obs": 252, "skew": 0.0, "kurt": 3.0},
        {"observed_sr": 0.05, "n_trials": 7, "n_obs": 252, "skew": 0.0, "kurt": 3.0},
        {"observed_sr": 0.05, "n_trials": 50, "n_obs": 252, "skew": 0.0, "kurt": 3.0},
        {"observed_sr": 0.08, "n_trials": 110, "n_obs": 3000, "skew": -0.3, "kurt": 5.2},
        {"observed_sr": 0.02, "n_trials": 200, "n_obs": 500, "skew": 0.1, "kurt": 4.0},
        {"observed_sr": -0.03, "n_trials": 10, "n_obs": 400, "skew": 0.0, "kurt": 3.0},
        {"observed_sr": -0.10, "n_trials": 50, "n_obs": 252, "skew": 0.5, "kurt": 6.0},
        {"observed_sr": 0.12, "n_trials": 1, "n_obs": 100, "skew": 0.0, "kurt": 3.0},
        {"observed_sr": 0.06, "n_trials": 10000, "n_obs": 2000, "skew": -0.2, "kurt": 4.5},
        {"observed_sr": 0.04, "n_trials": 112, "n_obs": 3654, "skew": -0.45, "kurt": 7.8},
        {"observed_sr": 0.15, "n_trials": 5, "n_obs": 60, "skew": 1.2, "kurt": 9.0},
    ]

    results = []
    for case in cases:
        dsr = deflated_sharpe_ratio(**case)
        results.append({**case, "deflated_sharpe_ratio": dsr})

    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=2)

    print(f"Wrote {len(results)} reference cases to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
