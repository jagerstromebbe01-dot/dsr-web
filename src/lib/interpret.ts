/** Produces a plain-language interpretation sentence for a DSR result. */
export function interpretDsr(params: {
  dsr: number;
  nTrials: number;
  observedSRAnnualized: number;
  benchmarkSRAnnualized: number;
}): string {
  const { dsr, nTrials, observedSRAnnualized, benchmarkSRAnnualized } = params;

  if (observedSRAnnualized <= 0) {
    return "Your Sharpe ratio is not positive, so there is no edge to deflate.";
  }

  const pct = (dsr * 100).toFixed(1);
  const trialsPhrase = nTrials === 1 ? "with no multiple-testing correction" : `after ${nTrials.toLocaleString("en-US")} trials`;
  const srPhrase = `your Sharpe ratio of ${observedSRAnnualized.toFixed(2)}`;

  const benchmarkSentence =
    nTrials > 1
      ? ` After ${nTrials.toLocaleString("en-US")} trials, your annualized Sharpe needs to exceed ${benchmarkSRAnnualized.toFixed(2)} just to match what pure chance would be expected to produce from this many trials — beating that is necessary but not sufficient for statistical significance.`
      : "";

  if (dsr >= 0.95) {
    return `${capitalize(trialsPhrase)}, ${srPhrase} is statistically distinguishable from luck at the 95% level (DSR = ${pct}%). That is evidence of genuine skill, not proof of it — DSR does not account for factors like changing market regimes or costs not included in this backtest.${benchmarkSentence}`;
  }
  if (dsr >= 0.5) {
    return `${capitalize(trialsPhrase)}, ${srPhrase} is only weakly distinguishable from luck (DSR = ${pct}%, below the common 95% threshold). The result is suggestive at best, not conclusive.${benchmarkSentence}`;
  }
  return `${capitalize(trialsPhrase)}, ${srPhrase} is no longer distinguishable from luck (DSR = ${pct}%). Given how many strategies were tried, a Sharpe ratio this high is close to what pure chance would be expected to produce anyway.${benchmarkSentence}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
