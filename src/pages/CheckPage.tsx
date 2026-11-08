import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { CheckInputError, runBacktestCheck } from "../lib/check";
import type { CheckResult, Verdict } from "../lib/check";
import type { DataFrequency } from "../lib/dsr";
import {
  extractColumn,
  guessReturnColumn,
  parseCsvTable,
  parseReturnsText,
} from "../lib/parseReturns";
import type { CsvTable, ParsedNumbers } from "../lib/parseReturns";
import { EvaporationCurve } from "../components/EvaporationCurve";
import { Disclaimer } from "../components/Disclaimer";
import { DSR_TIER_COLORS } from "../lib/color";
import { canvasToDownloadUrl, renderShareImage } from "../lib/shareImage";

const FREQUENCY_LABELS: Record<DataFrequency, string> = {
  daily: "Daily (252/yr)",
  daily_crypto: "Daily, crypto (365/yr)",
  weekly: "Weekly (52/yr)",
  monthly: "Monthly (12/yr)",
  custom: "Custom",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const VERDICT_TEXT: Record<Verdict, { emoji: string; title: string; detail: string }> = {
  green: {
    emoji: "🟢",
    title: "Probably a real edge",
    detail:
      "After correcting for the number of strategies you tried, this Sharpe ratio is unlikely to be luck (DSR ≥ 95%). That is evidence, not proof — regime changes and costs missing from the backtest are not covered.",
  },
  yellow: {
    emoji: "🟡",
    title: "Uncertain",
    detail:
      "The result is suggestive at best (DSR between 50% and 95%). It could be real, but luck is not ruled out. More data, fewer tried variants or an out-of-sample test would help.",
  },
  red: {
    emoji: "🔴",
    title: "Probably luck",
    detail:
      "With this many tried strategies, a Sharpe ratio like this is what pure chance would be expected to produce anyway (DSR below 50%).",
  },
};

/** Deterministic example series (seeded, so everyone sees the same result). */
function exampleSeries(): string {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed + 1) / 4294967297;
  };
  const out: number[] = [];
  for (let i = 0; i < 504; i++) {
    const z = Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
    out.push(0.0004 + 0.01 * z);
  }
  return out.map((x) => x.toFixed(5)).join("\n");
}

export function CheckPage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; table: CsvTable } | null>(null);
  const [fileColumn, setFileColumn] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);

  const [frequency, setFrequency] = useState<DataFrequency>("daily");
  const [customPeriods, setCustomPeriods] = useState("252");
  const [nInput, setNInput] = useState("");
  const [vInput, setVInput] = useState("");

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const parsed: ParsedNumbers = useMemo(() => {
    if (file) return extractColumn(file.table, fileColumn);
    return parseReturnsText(text);
  }, [file, fileColumn, text]);

  const { result, error } = useMemo((): { result: CheckResult | null; error: string | null } => {
    if (parsed.values.length === 0 && parsed.invalid.length === 0) return { result: null, error: null };
    if (parsed.invalid.length > 0) {
      const shown = parsed.invalid.slice(0, 5).join(", ");
      return {
        result: null,
        error: `Could not read ${parsed.invalid.length} value(s) as numbers (e.g. ${shown}). Use plain decimals like 0.012 or -0.004.`,
      };
    }
    if (nInput.trim() === "") return { result: null, error: null };
    const nTrials = Number(nInput);
    let variance: number | undefined;
    if (vInput.trim() !== "") {
      variance = Number(vInput);
      if (!Number.isFinite(variance)) return { result: null, error: "V must be a number (or leave it empty)." };
    }
    try {
      return {
        result: runBacktestCheck({
          returns: parsed.values,
          frequency,
          customPeriodsPerYear: frequency === "custom" ? Number(customPeriods) : undefined,
          nTrials,
          varianceOfTrialSharpes: variance,
        }),
        error: null,
      };
    } catch (e) {
      if (e instanceof CheckInputError) return { result: null, error: e.message };
      return { result: null, error: "Something went wrong while calculating." };
    }
  }, [parsed, nInput, vInput, frequency, customPeriods]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setFileError("File is larger than 5 MB.");
      return;
    }
    try {
      const table = parseCsvTable(await f.text());
      if (table.rows.length === 0) {
        setFileError("The file looks empty.");
        return;
      }
      setFile({ name: f.name, table });
      setFileColumn(guessReturnColumn(table));
    } catch {
      setFileError("Could not read the file.");
    }
  }

  async function handleShareImage() {
    setShareError(null);
    if (!result) return;
    try {
      const canvas = renderShareImage({
        observedSR: result.sharpe,
        nTrials: result.N,
        sqrtV: Math.sqrt(result.vUsed),
        periodsPerYear: result.periodsPerYear,
        benchmarkSR: result.benchmarkSR,
        deflatedSharpeRatio: result.dsr,
        frequencyLabel: FREQUENCY_LABELS[frequency],
        siteUrl: window.location.origin,
      });
      setShareUrl(await canvasToDownloadUrl(canvas));
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Failed to generate image");
    }
  }

  const verdict = result ? VERDICT_TEXT[result.verdict] : null;
  // The "V is estimated" warning is already explained in its own note above.
  const extraWarnings = result ? result.warnings.filter((w) => !w.startsWith("V (")) : [];
  const columnNames = file
    ? Array.from({ length: file.table.columnCount }, (_, i) => file.table.header?.[i] || `Column ${i + 1}`)
    : [];

  return (
    <div className="calculator-page">
      <section className="panel">
        <h2>Is my backtest overfit?</h2>
        <p className="hint">
          Paste the per-period returns of your backtest, say how many strategies you tried, and get a green / yellow /
          red answer based on the Deflated Sharpe Ratio (Bailey &amp; López de Prado, 2014).
        </p>
        <p className="hint note">
          <strong>Your data never leaves your computer.</strong> Everything is calculated in your browser; nothing is
          uploaded or stored.
        </p>

        <h3>1. Your returns</h3>
        <p className="hint">
          Decimal returns per period, one per line or separated by commas (0.012 = +1.2 %). Or upload a CSV file.
        </p>
        {!file && (
          <textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"0.0123\n-0.0041\n0.0008\n..."}
            aria-label="Returns, one per line"
          />
        )}
        <div className="share-row">
          <label className="file-button">
            Upload CSV…
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFile} hidden />
          </label>
          {!file && <button onClick={() => setText(exampleSeries())}>Load example</button>}
          {(file || text) && (
            <button
              onClick={() => {
                setFile(null);
                setText("");
                setShareUrl(null);
              }}
            >
              Clear
            </button>
          )}
        </div>
        {fileError && <p className="error-text">{fileError}</p>}
        {file && (
          <div className="field-row">
            <p className="hint">
              Using <strong>{file.name}</strong> ({file.table.rows.length} rows).
            </p>
            <label>
              Return column
              <select value={fileColumn} onChange={(e) => setFileColumn(Number(e.target.value))}>
                {columnNames.map((n, i) => (
                  <option key={i} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <p className="hint">
          Read <strong>{parsed.values.length}</strong> value(s).
        </p>

        <h3>2. Settings</h3>
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
              <input type="number" value={customPeriods} onChange={(e) => setCustomPeriods(e.target.value)} />
            </label>
          )}
          <label>
            Number of strategies tried (N)
            <input
              type="number"
              min={1}
              step={1}
              value={nInput}
              onChange={(e) => setNInput(e.target.value)}
              placeholder="e.g. 20"
            />
          </label>
        </div>
        <p className="hint">
          Number of <strong>independent</strong> strategies you tested. 500 almost identical variants do not count as
          500.
        </p>
        <details>
          <summary>Advanced: I know the spread of Sharpe ratios across my trials (V)</summary>
          <label>
            V (variance of the per-period Sharpe ratios of all tried strategies)
            <input type="number" step="any" value={vInput} onChange={(e) => setVInput(e.target.value)} placeholder="leave empty to estimate" />
          </label>
        </details>
      </section>

      {error && (
        <div className="panel error-panel">
          <h3>Please fix this</h3>
          <p>{error}</p>
        </div>
      )}

      {!error && parsed.values.length > 0 && nInput.trim() === "" && (
        <div className="panel warning-panel">
          <p>Enter N (the number of strategies you tried) to see the result.</p>
        </div>
      )}

      {result && verdict && (
        <section className="panel result-panel">
          <h2>Result</h2>
          <div className="verdict" role="status" aria-live="polite">
            <span className="verdict-light" aria-hidden="true">
              {verdict.emoji}
            </span>
            <div>
              <div className="verdict-title" style={{ color: DSR_TIER_COLORS[result.verdict] }}>
                {verdict.title}
                {result.vEstimated && <span className="estimate-badge">estimated</span>}
              </div>
              <div className="verdict-dsr">DSR = {(result.dsr * 100).toFixed(1)}%</div>
            </div>
          </div>
          <p className="interpretation">{verdict.detail}</p>
          {result.vEstimated && (
            <p className="hint note">
              <strong>Why “estimated”:</strong> the method needs to know how much Sharpe ratios vary across everything
              you tried. You did not give that, so it is assumed that your other strategies were pure noise (V = 1/(T−1)).
              It is a standard, reasonable assumption, but the verdict is an estimate.
            </p>
          )}

          <div className="result-grid">
            <div>
              <span className="result-label">Sharpe ratio (annualized / per period)</span>
              <span className="result-value">
                {result.sharpeAnnualized.toFixed(2)} / {result.sharpe.toFixed(4)}
              </span>
            </div>
            <div>
              <span className="result-label">Skewness</span>
              <span className="result-value">{result.skew.toFixed(2)}</span>
            </div>
            <div>
              <span className="result-label">Kurtosis (normal = 3)</span>
              <span className="result-value">{result.kurtosis.toFixed(2)}</span>
            </div>
            <div>
              <span className="result-label">Observations (T)</span>
              <span className="result-value">{result.T}</span>
            </div>
            <div>
              <span className="result-label">Tried strategies (N)</span>
              <span className="result-value">{result.N}</span>
            </div>
            <div>
              <span className="result-label">Sharpe needed to beat luck (annualized)</span>
              <span className="result-value">{(result.benchmarkSR * Math.sqrt(result.periodsPerYear)).toFixed(2)}</span>
            </div>
          </div>

          {extraWarnings.length > 0 && (
            <div className="warning-panel">
              <ul>
                {extraWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <h3>Evaporation curve</h3>
          <EvaporationCurve
            sqrtV={Math.sqrt(result.vUsed)}
            nTrials={result.N}
            observedSR={result.sharpe}
            benchmarkSR={result.benchmarkSR}
            periodsPerYear={result.periodsPerYear}
          />
          <p className="hint">
            The curve shows how the Sharpe ratio needed to beat luck rises as more strategies are tried (N), in
            annualized terms. The vertical line marks your N.
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
