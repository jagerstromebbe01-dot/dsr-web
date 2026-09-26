/** Tiering used to color-code a DSR result consistently across the UI
 * and the shareable PNG: >=95% is strong evidence, 80-95% is weak,
 * below 80% is not distinguishable from luck. */
export type DsrTier = "green" | "yellow" | "red";

export function dsrTier(dsr: number): DsrTier {
  if (dsr >= 0.95) return "green";
  if (dsr >= 0.8) return "yellow";
  return "red";
}

/** Hex values matching the CSS custom properties in index.css/App.css
 * (--success / --tier-yellow / --tier-red) - duplicated here because
 * the canvas-based PNG export can't read CSS variables. */
export const DSR_TIER_COLORS: Record<DsrTier, string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
};
