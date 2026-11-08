import { verdictFromDsr } from "./thresholds";
import type { Verdict } from "./thresholds";

/** Tiering used to color-code a DSR result consistently across the UI
 * and the shareable PNG. The cut-offs live in thresholds.ts. */
export type DsrTier = Verdict;

export function dsrTier(dsr: number): DsrTier {
  return verdictFromDsr(dsr);
}

/** Hex values matching the CSS custom properties in index.css/App.css
 * (--success / --tier-yellow / --tier-red) - duplicated here because
 * the canvas-based PNG export can't read CSS variables. */
export const DSR_TIER_COLORS: Record<DsrTier, string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
};
