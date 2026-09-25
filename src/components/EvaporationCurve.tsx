import { buildEvaporationCurveGeometry, curveToSvgPath } from "../lib/evaporationCurve";

export interface EvaporationCurveProps {
  sqrtV: number;
  nTrials: number;
  observedSR: number;
  benchmarkSR: number;
  width?: number;
  height?: number;
}

/** Renders the "evaporation curve": SR*_0(N) rising with N, with a
 * marker for where the user's own trial count and Sharpe ratio sit. */
export function EvaporationCurve({
  sqrtV,
  nTrials,
  observedSR,
  benchmarkSR,
  width = 700,
  height = 400,
}: EvaporationCurveProps) {
  const geometry = buildEvaporationCurveGeometry({ sqrtV, nTrials, observedSR, width, height });
  const pathD = curveToSvgPath(geometry);

  const xTicks = [1, 10, 50, 100, 500, 1000, 5000, 10000].filter(
    (n) => n >= geometry.nMin && n <= geometry.nMax,
  );
  const yTicks = 5;

  const userX = geometry.xForN(nTrials);
  const userBenchmarkY = geometry.yForSr(benchmarkSR);
  const userObservedY = geometry.yForSr(observedSR);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="evaporation-curve"
      role="img"
      aria-label={`Chart showing the deflation benchmark rising with the number of trials, currently at N=${nTrials}`}
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
            <text x={geometry.padding.left - 8} y={y + 4} textAnchor="end" className="chart-axis-label">
              {sr.toFixed(3)}
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
            y={height - geometry.padding.bottom + 20}
            textAnchor="middle"
            className="chart-axis-label"
          >
            {n}
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
        Sharpe ratio (per period)
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
      <circle cx={userX} cy={userBenchmarkY} r={5} className="chart-user-point" />
      <circle cx={userX} cy={userObservedY} r={5} className="chart-observed-point" />
    </svg>
  );
}
