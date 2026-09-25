/**
 * Pure geometry for the "evaporation curve" chart: how the deflation
 * benchmark SR*_0(N) rises as the number of tried strategies N grows,
 * for a fixed sqrt(V). Kept independent of any rendering target (SVG
 * JSX or canvas 2D) so the on-page chart and the shareable PNG draw
 * from exactly the same numbers.
 */

import { expectedMaxSharpeRatio } from "./dsr";

export interface CurvePoint {
  n: number;
  srStar: number;
}

export interface CurveGeometry {
  points: CurvePoint[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  nMin: number;
  nMax: number;
  srMax: number;
  xForN: (n: number) => number;
  yForSr: (sr: number) => number;
}

/** Builds the curve's data points and pixel-space scale functions. */
export function buildEvaporationCurveGeometry(params: {
  sqrtV: number;
  nTrials: number;
  observedSR: number;
  width?: number;
  height?: number;
}): CurveGeometry {
  const { sqrtV, nTrials, observedSR } = params;
  const width = params.width ?? 700;
  const height = params.height ?? 400;
  const padding = { top: 24, right: 24, bottom: 48, left: 56 };

  const nMin = 1;
  // Show at least an order of magnitude past the user's own N so the
  // curve's continued rise is visible, with a sensible floor.
  const nMax = Math.max(nTrials * 10, 200);

  const steps = 120;
  const points: CurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    // log-spaced from nMin to nMax
    const logN = Math.log10(nMin) + (i / steps) * (Math.log10(nMax) - Math.log10(nMin));
    const n = Math.round(10 ** logN);
    const srStar = expectedMaxSharpeRatio(n, sqrtV);
    points.push({ n: Math.max(n, 1), srStar });
  }

  const srMax = Math.max(observedSR, ...points.map((p) => p.srStar)) * 1.15 || 0.01;

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xForN = (n: number) => {
    const logN = Math.log10(Math.max(n, nMin));
    const t = (logN - Math.log10(nMin)) / (Math.log10(nMax) - Math.log10(nMin));
    return padding.left + t * plotWidth;
  };

  const yForSr = (sr: number) => {
    const t = sr / srMax;
    return padding.top + plotHeight - t * plotHeight;
  };

  return { points, width, height, padding, nMin, nMax, srMax, xForN, yForSr };
}

/** SVG path "d" attribute string for the curve, from a geometry object. */
export function curveToSvgPath(geometry: CurveGeometry): string {
  return geometry.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${geometry.xForN(p.n)} ${geometry.yForSr(p.srStar)}`)
    .join(" ");
}
