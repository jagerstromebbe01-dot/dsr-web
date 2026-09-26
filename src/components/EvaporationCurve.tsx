import { buildEvaporationCurveGeometry, curveToSvgPath, pickLogTicks } from "../lib/evaporationCurve";

export interface EvaporationCurveProps {
  sqrtV: number;
  nTrials: number;
  observedSR: number;
  benchmarkSR: number;
  /** Periods per year for the current data frequency - when given, the
   * chart's Sharpe axis is annualized (SR * sqrt(periodsPerYear)) rather
   * than per-period, since annualized Sharpe is what most people reason
   * about. The underlying N-vs-benchmark relationship is unaffected. */
  periodsPerYear: number;
  width?: number;
  height?: number;
}

/** Renders the "evaporation curve": SR*_0(N) rising with N, with a
 * marker for where the user's own trial count and Sharpe ratio sit.
 * The Sharpe axis is shown annualized. */
export function EvaporationCurve({
  sqrtV,
  nTrials,
  observedSR,
  benchmarkSR,
  periodsPerYear,
  width = 700,
  height = 400,
}: EvaporationCurveProps) {
  const annualizeFactor = Math.sqrt(periodsPerYear);
  const geometry = buildEvaporationCurveGeometry({
    sqrtV: sqrtV * annualizeFactor,
    nTrials,
    observedSR: observedSR * annualizeFactor,
    width,
    height,
  });
  const pathD = curveToSvgPath(geometry);

  const xTicks = pickLogTicks(geometry.nMin, geometry.nMax, 5);
  const yTicks = 4;

  const userX = geometry.xForN(nTrials);
  const userBenchmarkY = geometry.yForSr(benchmarkSR * annualizeFactor);
  const userObservedY = geometry.yForSr(observedSR * annualizeFactor);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="evaporation-curve"
      role="img"
      aria-label={`Chart showing the annualized deflation benchmark rising with the number of trials, currently at N=${nTrials}`}
    >
      {/* Y axis gridlines + labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const sr = (geometry.srMax * i) / yTicks;
        const y = geometry.yForSr(sr);
        return (
          <g key={`y-${i}`}>
            <line
              x1={geometry.padding.left}
              x2={width - geometry.padding.right}
              y1={y}
              y2={y}
              className="chart-gridline"
            />
            <text x={geometry.padding.left - 14} y={y + 5} textAnchor="end" className="chart-axis-label">
              {sr.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* X axis ticks */}
      {xTicks.map((n) => (
        <g key={`x-${n}`}>
          <line
            x1={geometry.xForN(n)}
            x2={geometry.xForN(n)}
            y1={height - geometry.padding.bottom}
            y2={height - geometry.padding.bottom + 6}
            className="chart-tick"
          />
          <text
            x={geometry.xForN(n)}
            y={height - geometry.padding.bottom + 28}
            textAnchor="middle"
            className="chart-axis-label"
          >
            {n.toLocaleString("en-US")}
          </text>
        </g>
      ))}

      {/* Axis titles */}
      <text
        x={geometry.padding.left + (width - geometry.padding.left - geometry.padding.right) / 2}
        y={height - 6}
        textAnchor="middle"
        className="chart-axis-title"
      >
        Number of trials (N), log scale
      </text>
      <text
        x={-(geometry.padding.top + (height - geometry.padding.top - geometry.padding.bottom) / 2)}
        y={16}
        textAnchor="middle"
        transform="rotate(-90)"
        className="chart-axis-title"
      >
        Sharpe ratio (annualized)
      </text>

      {/* The curve itself */}
      <path d={pathD} className="chart-curve" fill="none" />

      {/* User's observed Sharpe as a horizontal reference line */}
      <line
        x1={geometry.padding.left}
        x2={width - geometry.padding.right}
        y1={userObservedY}
        y2={userObservedY}
        className="chart-observed-line"
      />

      {/* User's point on the benchmark curve */}
      <line x1={userX} x2={userX} y1={geometry.padding.top} y2={height - geometry.padding.bottom} className="chart-user-line" />
      <circle cx={userX} cy={userBenchmarkY} r={6} className="chart-user-point" />
      <circle cx={userX} cy={userObservedY} r={6} className="chart-observed-point" />
    </svg>
  );
}
