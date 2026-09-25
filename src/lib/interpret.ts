/** Produces a plain-language interpretation sentence for a DSR result. */
export function interpretDsr(params: {
  dsr: number;
  nTrials: number;
  observedSRAnnualized: number;
}): string {
  const { dsr, nTrials, observedSRAnnualized } = params;
  const pct = (dsr * 100).toFixed(1);
  const trialsPhrase = nTrials === 1 ? "with no multiple-testing correction" : `after ${nTrials.toLocaleString("en-US")} trials`;
  const srPhrase = `your Sharpe ratio of ${observedSRAnnualized.toFixed(2)}`;

  if (dsr >= 0.95) {
    return `${capitalize(trialsPhrase)}, ${srPhrase} is statistically distinguishable from luck at the 95% level (DSR = ${pct}%). That is evidence of genuine skill, not proof of it — DSR does not account for factors like changing market regimes or costs not included in this backtest.`;
  }
  if (dsr >= 0.5) {
    return `${capitalize(trialsPhrase)}, ${srPhrase} is only weakly distinguishable from luck (DSR = ${pct}%, below the common 95% threshold). The result is suggestive at best, not conclusive.`;
  }
  return `${capitalize(trialsPhrase)}, ${srPhrase} is no longer distinguishable from luck (DSR = ${pct}%). Given how many strategies were tried, a Sharpe ratio this high is close to what pure chance would be expected to produce anyway.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
