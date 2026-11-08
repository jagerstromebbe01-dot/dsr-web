/**
 * The ONE place that defines where green / yellow / red begin.
 * color.ts, interpret.ts, check.ts, the share image, the API and the badge
 * all use this, so the site can never disagree with itself.
 *
 *   DSR >= 0.95        -> green  (probably a real edge)
 *   0.50 <= DSR < 0.95 -> yellow (uncertain)
 *   DSR < 0.50         -> red    (probably luck)
 */
export const DSR_GREEN_MIN = 0.95;
export const DSR_YELLOW_MIN = 0.5;

export type Verdict = "green" | "yellow" | "red";

export function verdictFromDsr(dsr: number): Verdict {
  if (dsr >= DSR_GREEN_MIN) return "green";
  if (dsr >= DSR_YELLOW_MIN) return "yellow";
  return "red";
}
