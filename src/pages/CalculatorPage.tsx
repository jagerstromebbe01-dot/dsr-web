import { useMemo, useState } from "react";
import {
  PERIODS_PER_YEAR,
  annualizedToPerPeriodSharpe,
  perPeriodToAnnualizedSharpe,
  deflatedSharpeRatio,
  excessKurtosisToNonExcess,
  nullHypothesisV,
  varianceOfSharpeRatios,
} from "../lib/dsr";
import type { DataFrequency } from "../lib/dsr";
import {
  validateDenominator,
  validateKurtosis,
  validateNObs,
  validateNTrials,
  validatePastedSharpeCount,
  validateSharpe,
  validateVariance,
} from "../lib/validation";
import { interpretDsr } from "../lib/interpret";
import { EvaporationCurve } from "../components/EvaporationCurve";
import { Disclaimer } from "../components/Disclaimer";
import { canvasToDownloadUrl, renderShareImage } from "../lib/shareImage";

type SrInputMode = "annualized" | "per_period";
type KurtConvention = "excess" | "non_excess";
type VMode = "unknown" | "measured";
type VMeasuredMode = "direct" | "paste";

const FREQUENCY_LABELS: Record<DataFrequency, string> = {
  daily: "Daily (252/yr)",
  daily_crypto: "Daily, crypto (365/yr)",
  weekly: "Weekly (52/yr)",
  monthly: "Monthly (12/yr)",
  custom: "Custom",
};

function parsePastedSharpes(text: string): number[] {
  return text
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export function CalculatorPage() {
  const [frequency, setFrequency] = useState<DataFrequency>("daily");
  const [customPeriodsPerYear, setCustomPeriodsPerYear] = useState("252");

  const [srInputMode, setSrInputMode] = useState<SrInputMode>("annualized");
  const [srInputValue, setSrInputValue] = useState("1.0");

  const [nObsInput, setNObsInput] = useState("500");
  const [nTrialsInput, setNTrialsInput] = useState("1");

  const [skewInput, setSkewInput] = useState("0");
  const [kurtInput, setKurtInput] = useState("3");
  const [kurtConvention, setKurtConvention] = useState<KurtConvention>("non_excess");

  const [vMode, setVMode] = useState<VMode>("unknown");
  const [vMeasuredMode, setVMeasuredMode] = useState<VMeasuredMode>("direct");
  const [vDirectValue, setVDirectValue] = useState("0.002");
  const [vDirectIsAnnualized, setVDirectIsAnnualized] = useState(false);
  const [pastedSharpesText, setPastedSharpesText] = useState("");
  const [pastedAreAnnualized, setPastedAreAnnualized] = useState(true);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const periodsPerYear = useMemo(() => {
    return frequency === "custom" ? Number(customPeriodsPerYear) : PERIODS_PER_YEAR[frequency];
  }, [frequency, customPeriodsPerYear]);

  const nObs = Number(nObsInput);
  const nTrials = Number(nTrialsInput);
  const skew = Number(skewInput) || 0;
  const kurtRaw = Number(kurtInput);
  const kurt = kurtConvention === "excess" ? excessKurtosisToNonExcess(kurtRaw) : kurtRaw;

  const srInputNumber = Number(srInputValue);
  const srAnnualized =
    srInputMode === "annualized" ? srInputNumber : perPeriodToAnnualizedSharpe(srInputNumber, periodsPerYear);
  const srPerPeriod =
    srInputMode === "per_period" ? srInputNumber : annualizedToPerPeriodSharpe(srInputNumber, periodsPerYear);

  const pastedSharpesRaw = useMemo(() => parsePastedSharpes(pastedSharpesText), [pastedSharpesText]);
  const pastedSharpesPerPeriod = useMemo(() => {
    if (!pastedAreAnnualized) return pastedSharpesRaw;
    return pastedSharpesRaw.map((s) => annualizedToPerPeriodSharpe(s, periodsPerYear));
  }, [pastedSharpesRaw, pastedAreAnnualized, periodsPerYear]);

  const vDirectPerPeriod = useMemo(() => {
    const v = Number(vDirectValue);
    if (!Number.isFinite(v)) return NaN;
    return vDirectIsAnnualized ? v / periodsPerYear : v;
  }, [vDirectValue, vDirectIsAnnualized, periodsPerYear]);

  // --- validation ---
  const errors: string[] = [];
  const errNObs = validateNObs(nObs);
  const errNTrials = validateNTrials(nTrials);
  const errSharpe = validateSharpe(srInputNumber, "Sharpe ratio");
  const errKurt = validateKurtosis(kurt);
  if (errNObs) errors.push(errNObs);
  if (errNTrials) errors.push(errNTrials);
  if (errSharpe) errors.push(errSharpe);
  if (errKurt) errors.push(errKurt);
  if (!errNObs && !errKurt) {
    const errDenom = validateDenominator(srPerPeriod, skew, kurt);
    if (errDenom) errors.push(errDenom);
  }

  let varianceOfTrialSharpes: number | undefined;
  const warnings: string[] = [];

  if (vMode === "measured") {
    if (vMeasuredMode === "direct") {
      const errV = validateVariance(vDirectPerPeriod);
      if (errV) errors.push(errV);
      else varianceOfTrialSharpes = vDirectPerPeriod;
    } else {
      if (pastedSharpesRaw.length < 2) {
        errors.push("Paste at least 2 Sharpe ratios to compute a variance.");
      } else {
        varianceOfTrialSharpes = varianceOfSharpeRatios(pastedSharpesPerPeriod);
        const warn = validatePastedSharpeCount(pastedSharpesRaw.length, nTrials);
        if (warn) warnings.push(warn);
      }
    }
  }

  const canCompute = errors.length === 0;

  const result = useMemo(() => {
    if (!canCompute) return null;
    try {
      return deflatedSharpeRatio({
        observedSR: srPerPeriod,
        nTrials,
        nObs,
        skew,
        kurt,
        varianceOfTrialSharpes,
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCompute, srPerPeriod, nTrials, nObs, skew, kurt, varianceOfTrialSharpes]);

  async function handleShareImage() {
    setShareError(null);
    if (!result) return;
    try {
      const canvas = renderShareImage({
        observedSR: srAnnualized,
        nTrials,
        sqrtV: Math.sqrt(result.vUsed),
        benchmarkSR: result.benchmarkSR,
        deflatedSharpeRatio: result.deflatedSharpeRatio,
        frequencyLabel: FREQUENCY_LABELS[frequency],
        siteUrl: window.location.origin,
      });
      const url = await canvasToDownloadUrl(canvas);
      setShareUrl(url);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Failed to generate image");
    }
  }

  return (
    <div className="calculator-page">
      <section className="panel">
        <h2>1. Your backtest</h2>

        <div className="field-row">
          <label>
            Data frequency
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as DataFrequency)}>
              {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {frequency === "custom" && (
            <label>
              Periods per year
              <input
                type="number"
                value={customPeriodsPerYear}
                onChange={(e) => setCustomPeriodsPerYear(e.target.value)}
              />
            </label>
          )}
        </div>

        <div className="field-row">
          <label>
            Sharpe ratio is
            <select value={srInputMode} onChange={(e) => setSrInputMode(e.target.value as SrInputMode)}>
              <option value="annualized">Annualized</option>
              <option value="per_period">Per period (already)</option>
            </select>
          </label>
          <label>
            Sharpe ratio value
            <input type="number" step="any" value={srInputValue} onChange={(e) => setSrInputValue(e.target.value)} />
          </label>
        </div>
        <p className="hint">
          Per-period Sharpe used in the math: <strong>{Number.isFinite(srPerPeriod) ? srPerPeriod.toFixed(6) : "—"}</strong> ·
          Annualized: <strong>{Number.isFinite(srAnnualized) ? srAnnualized.toFixed(4) : "—"}</strong>
        </p>

        <div className="field-row">
          <label>
            Number of observations (T)
            <input type="number" value={nObsInput} onChange={(e) => setNObsInput(e.target.value)} />
          </label>
          <label>
            Number of trials (N)
            <input type="number" value={nTrialsInput} onChange={(e) => setNTrialsInput(e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <label>
            Skewness (γ₃)
            <input type="number" step="any" value={skewInput} onChange={(e) => setSkewInput(e.target.value)} />
          </label>
          <label>
            Kurtosis convention
            <select value={kurtConvention} onChange={(e) => setKurtConvention(e.target.value as KurtConvention)}>
              <option value="non_excess">Non-excess (normal = 3)</option>
              <option value="excess">Excess (normal = 0)</option>
            </select>
          </label>
          <label>
            Kurtosis (γ₄) value
            <input type="number" step="any" value={kurtInput} onChange={(e) => setKurtInput(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>2. Variance of tried strategies' Sharpe ratios (V)</h2>
        <div className="field-row">
          <label>
            <input type="radio" checked={vMode === "unknown"} onChange={() => setVMode("unknown")} />
            V is unknown — use the null-hypothesis approximation
          </label>
        </div>
        {vMode === "unknown" && (
          <p className="hint note">
            Null-hypothesis approximation: assumes all tried strategies were pure noise. Sets{" "}
            <strong>V = 1 / (T − 1)</strong> — the variance of the Sharpe ratio estimator itself, evaluated at SR = 0
            (the point where the PSR denominator's skew/kurtosis terms vanish). This is a standard, conservative
            fallback when you don't know the actual spread of Sharpe ratios across everything you tried.{" "}
            {!errNObs && <>Current value: V ≈ {nullHypothesisV(nObs).toExponential(4)}.</>}
          </p>
        )}

        <div className="field-row">
          <label>
            <input type="radio" checked={vMode === "measured"} onChange={() => setVMode("measured")} />
            V is measured
          </label>
        </div>
        {vMode === "measured" && (
          <div className="indent">
            <div className="field-row">
              <label>
                <input
                  type="radio"
                  checked={vMeasuredMode === "direct"}
                  onChange={() => setVMeasuredMode("direct")}
                />
                Enter V directly
              </label>
              <label>
                <input
                  type="radio"
                  checked={vMeasuredMode === "paste"}
                  onChange={() => setVMeasuredMode("paste")}
                />
                Paste a list of Sharpe ratios
              </label>
            </div>

            {vMeasuredMode === "direct" && (
              <div className="field-row">
                <label>
                  V value
                  <input type="number" step="any" value={vDirectValue} onChange={(e) => setVDirectValue(e.target.value)} />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={vDirectIsAnnualized}
                    onChange={(e) => setVDirectIsAnnualized(e.target.checked)}
                  />
                  This V is annualized (convert to per-period)
                </label>
              </div>
            )}

            {vMeasuredMode === "paste" && (
              <>
                <label>
                  Sharpe ratios (one per line, or comma/space separated)
                  <textarea
                    rows={5}
                    value={pastedSharpesText}
                    onChange={(e) => setPastedSharpesText(e.target.value)}
                    placeholder={"1.10\n0.85\n-0.20\n1.45\n..."}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={pastedAreAnnualized}
                    onChange={(e) => setPastedAreAnnualized(e.target.checked)}
                  />
                  These Sharpe ratios are annualized (convert to per-period using the frequency above)
                </label>
                <p className="hint">
                  Parsed {pastedSharpesRaw.length} value(s)
                  {pastedSharpesRaw.length >= 2 &&
                    ` — sample variance (per period): ${varianceOfSharpeRatios(pastedSharpesPerPeriod).toExponential(4)}`}
                </p>
              </>
            )}
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <div className="panel error-panel">
          <h3>Please fix the following</h3>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="panel warning-panel">
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <section className="panel result-panel">
          <h2>Result</h2>
          <div className="result-grid">
            <div>
              <span className="result-label">Raw Sharpe (per period)</span>
              <span className="result-value">{srPerPeriod.toFixed(6)}</span>
            </div>
            <div>
              <span className="result-label">Deflated benchmark SR*₀</span>
              <span className="result-value">{result.benchmarkSR.toFixed(6)}</span>
            </div>
            <div>
              <span className="result-label">Deflated Sharpe Ratio (DSR)</span>
              <span className="result-value highlight">{(result.deflatedSharpeRatio * 100).toFixed(2)}%</span>
            </div>
            <div>
              <span className="result-label">V used {result.vWasApproximated ? "(approximated)" : "(measured)"}</span>
              <span className="result-value">{result.vUsed.toExponential(4)}</span>
            </div>
          </div>

          <p className="interpretation">
            {interpretDsr({ dsr: result.deflatedSharpeRatio, nTrials, observedSRAnnualized: srAnnualized })}
          </p>

          <h3>Evaporation curve</h3>
          <EvaporationCurve
            sqrtV={Math.sqrt(result.vUsed)}
            nTrials={nTrials}
            observedSR={srPerPeriod}
            benchmarkSR={result.benchmarkSR}
          />
          <p className="hint">
            The curve shows how the deflation benchmark SR*₀ rises as more strategies are tried (N). The vertical line
            marks your own N; the orange dot is where your observed Sharpe sits, the blue dot is the benchmark at
            that N.
          </p>

          <div className="share-row">
            <button onClick={handleShareImage}>Generate shareable image</button>
            {shareUrl && (
              <a href={shareUrl} download="dsr-result.png" className="download-link">
                Download PNG
              </a>
            )}
            {shareError && <p className="error-text">{shareError}</p>}
          </div>
        </section>
      )}

      <Disclaimer />
    </div>
  );
}
