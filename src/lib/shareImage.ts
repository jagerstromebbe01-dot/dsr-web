/**
 * Generates a shareable PNG summary of a DSR result using the Canvas
 * API. Reuses the exact same curve geometry as the on-page SVG chart
 * (src/components/EvaporationCurve.tsx / lib/evaporationCurve.ts) so
 * the two never drift apart.
 *
 * No data leaves the browser: this draws directly to an in-memory
 * canvas and hands back a blob URL for download. No personal data is
 * embedded in the image - only the numbers the user chose to compute.
 */

import { buildEvaporationCurveGeometry } from "./evaporationCurve";
import { DSR_TIER_COLORS, dsrTier } from "./color";

export interface ShareImageParams {
  /** Per-period Sharpe (not annualized) - this function annualizes it
   * internally using periodsPerYear, same as the on-page chart. */
  observedSR: number;
  nTrials: number;
  /** Per-period sqrt(V) - annualized internally, same as observedSR. */
  sqrtV: number;
  periodsPerYear: number;
  benchmarkSR: number;
  deflatedSharpeRatio: number;
  frequencyLabel: string;
  siteUrl: string;
}

const WIDTH = 1200;
const HEIGHT = 675;

export function renderShareImage(params: ShareImageParams): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Background
  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "bold 40px system-ui, -apple-system, sans-serif";
  ctx.fillText("Backtest Overfitting Calculator", 48, 72);

  ctx.strokeStyle = "#2a2d35";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 96);
  ctx.lineTo(WIDTH - 48, 96);
  ctx.stroke();

  const tier = dsrTier(params.deflatedSharpeRatio);
  const tierColor = DSR_TIER_COLORS[tier];
  const annualizeFactor = Math.sqrt(params.periodsPerYear);
  const observedSRAnnualized = params.observedSR * annualizeFactor;
  const sqrtVAnnualized = params.sqrtV * annualizeFactor;

  // Stat blocks
  const stats: Array<[string, string, string?]> = [
    ["Raw Sharpe (annualized)", observedSRAnnualized.toFixed(2)],
    ["Data frequency", params.frequencyLabel],
    ["Number of trials (N)", params.nTrials.toLocaleString("en-US")],
    ["Deflated Sharpe Ratio", `${(params.deflatedSharpeRatio * 100).toFixed(1)}%`, tierColor],
  ];

  const colWidth = (WIDTH - 96) / 2;
  stats.forEach(([label, value, color], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 48 + col * colWidth;
    const y = 150 + row * 90;

    ctx.fillStyle = "#9ca3af";
    ctx.font = "20px system-ui, -apple-system, sans-serif";
    ctx.fillText(label, x, y);

    ctx.fillStyle = color ?? "#f4f4f5";
    ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
    ctx.fillText(value, x, y + 38);
  });

  // Mini evaporation curve (annualized, matching the on-page chart)
  const chartX = 48;
  const chartY = 340;
  const chartW = WIDTH - 96;
  const chartH = 260;

  const geometry = buildEvaporationCurveGeometry({
    sqrtV: sqrtVAnnualized,
    nTrials: params.nTrials,
    observedSR: observedSRAnnualized,
    width: chartW,
    height: chartH,
  });

  ctx.save();
  ctx.translate(chartX, chartY);

  ctx.strokeStyle = "#3f3f46";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, chartW, chartH);

  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 3;
  ctx.beginPath();
  geometry.points.forEach((p, i) => {
    const x = geometry.xForN(p.n);
    const y = geometry.yForSr(p.srStar);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const userX = geometry.xForN(params.nTrials);
  const userY = geometry.yForSr(observedSRAnnualized);
  ctx.fillStyle = tierColor;
  ctx.beginPath();
  ctx.arc(userX, userY, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Footer: site URL + disclaimer
  ctx.fillStyle = "#6b7280";
  ctx.font = "20px system-ui, -apple-system, sans-serif";
  ctx.fillText(params.siteUrl, 48, HEIGHT - 32);

  ctx.textAlign = "right";
  ctx.fillText("Educational tool — not investment advice", WIDTH - 48, HEIGHT - 32);
  ctx.textAlign = "left";

  return canvas;
}

export function canvasToDownloadUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to render PNG"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}
