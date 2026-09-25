import { Disclaimer } from "../components/Disclaimer";

export function ArticlePage() {
  return (
    <article className="article">
      <h1>Why your backtest is probably lying</h1>

      <p>
        Run enough coin flips and one of them will look like a magic coin. Run enough backtests and one of them will
        look like a genuine trading edge — even if every single one of them was pure noise. This is the multiple-testing
        problem, and it is the single most common way backtests deceive the people who ran them.
      </p>

      <p>
        The Deflated Sharpe Ratio (DSR), introduced by Bailey &amp; López de Prado in{" "}
        <em>"The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting, and Non-Normality"</em>{" "}
        (2014), is a statistic built specifically to answer one question honestly: given how many variants you tried
        before landing on this one, how much of your Sharpe ratio is real, and how much is the expected result of
        searching?
      </p>

      <h2>The core idea</h2>
      <p>
        If you test one strategy, a Sharpe ratio of 1.5 is meaningfully different from a Sharpe ratio of 0. But if you
        test 200 strategies and keep the best one, some of those 200 will show a high Sharpe ratio purely by chance —
        that is simply what happens when you take the maximum of many random draws. The more variants you try, the
        higher the bar climbs for a result to still look surprising. DSR raises that bar explicitly and tells you
        whether your result clears it.
      </p>

      <h2>The formula, symbol by symbol</h2>

      <h3>1. The Sharpe ratio estimator's uncertainty</h3>
      <p>
        A Sharpe ratio computed from a finite sample isn't a fixed truth — it is an estimate with its own uncertainty,
        and that uncertainty depends on the shape of the return distribution, not just its mean and variance.
      </p>
      <pre>
        PSR(SR*) = Φ( (SR̂ − SR*) · √(T − 1) / √(1 − γ₃·SR̂ + ((γ₄ − 1)/4)·SR̂²) )
      </pre>
      <ul>
        <li>
          <strong>PSR(SR*)</strong> — the Probabilistic Sharpe Ratio: the probability that the strategy's true Sharpe
          ratio exceeds a benchmark <code>SR*</code>, given everything observed.
        </li>
        <li>
          <strong>SR̂</strong> — the observed Sharpe ratio, always <em>per period</em> (e.g. daily), never annualized.
          Annualizing before this formula is one of the most common ways people silently corrupt the result.
        </li>
        <li>
          <strong>SR*</strong> — the benchmark you're testing against. Naively, people use 0 ("is this better than
          nothing?"). DSR instead uses a benchmark that already accounts for how many things you tried — see below.
        </li>
        <li>
          <strong>T</strong> — the number of return observations in the backtest (e.g. trading days).
        </li>
        <li>
          <strong>γ₃</strong> — the sample skewness of the return series. Negative skew (occasional large losses) makes
          the Sharpe ratio estimator less reliable and PSR more conservative.
        </li>
        <li>
          <strong>γ₄</strong> — the sample kurtosis of the return series, in the <em>non-excess</em> convention where a
          normal distribution has kurtosis 3 (not 0). Fat tails inflate this number and further discount the result.
        </li>
        <li>
          <strong>Φ</strong> — the standard normal cumulative distribution function, converting a z-score into a
          probability.
        </li>
      </ul>

      <h3>2. The benchmark that accounts for how much you searched</h3>
      <pre>SR*₀ = √V · [ (1 − γ)·Φ⁻¹(1 − 1/N) + γ·Φ⁻¹(1 − 1/(N·e)) ]</pre>
      <ul>
        <li>
          <strong>N</strong> — the total number of independently tested strategies or variants, including this one.
          This is the number that must be tracked honestly and counted <em>before</em> seeing results — inflating it
          after the fact defeats the entire purpose.
        </li>
        <li>
          <strong>V</strong> — the variance of the (per-period) Sharpe ratios across all N tried strategies. If you
          don't know it, a standard conservative approximation is available (see the calculator) — but a measured V
          from your own actual trial history is always better.
        </li>
        <li>
          <strong>γ</strong> — the Euler–Mascheroni constant (≈ 0.5772), part of the asymptotic formula for the
          expected maximum of N draws from a normal distribution.
        </li>
        <li>
          <strong>e</strong> — Euler's number.
        </li>
        <li>
          <strong>Φ⁻¹</strong> — the inverse of the standard normal CDF (the quantile function).
        </li>
      </ul>
      <p>
        <strong>SR*₀</strong> is the expected value of the <em>best</em> Sharpe ratio you'd see among N strategies if
        every single one of them had zero true skill. It rises as N grows — the more you search, the higher a result
        needs to be before it stops looking like the winner of a lottery.
      </p>

      <h3>3. Putting it together</h3>
      <pre>DSR = PSR(SR*₀)</pre>
      <p>
        The Deflated Sharpe Ratio is simply the Probabilistic Sharpe Ratio evaluated against that inflated,
        search-aware benchmark instead of against zero. A DSR of 95% is often read as "still standing at the 95%
        confidence level after accounting for everything you tried."
      </p>

      <h2>Common ways people get this wrong</h2>
      <ul>
        <li>
          <strong>Using an annualized Sharpe ratio directly in the formula.</strong> The formula's √(T−1) scaling
          assumes a per-period Sharpe. Plugging in an annualized number silently produces a nonsensical result.
        </li>
        <li>
          <strong>Not counting every variant.</strong> If you tried 40 parameter combinations and only remember
          testing "a few," your real N is 40, not "a few." DSR is only as honest as the trial count you feed it.
        </li>
        <li>
          <strong>Confusing excess and non-excess kurtosis.</strong> A normal distribution has kurtosis 3 in the
          non-excess convention this formula uses, and 0 in the excess convention many software packages default to.
          Mixing them up silently changes the result.
        </li>
        <li>
          <strong>Combining several individually-failed strategies and testing only the combination.</strong> A
          combination is its own new hypothesis with its own N contribution — it does not inherit a pass from
          strategies that individually failed, and testing only the combination while ignoring its own place in the
          trial count reintroduces exactly the bias DSR exists to catch.
        </li>
      </ul>

      <h2>What DSR does not tell you</h2>
      <p>
        DSR corrects for selection bias and non-normality within the sample you tested on. It does not verify that
        your backtest itself is free of look-ahead bias, survivorship bias, unrealistic transaction costs, or that
        the market regime you tested in will persist. A high DSR is necessary evidence, not sufficient proof.
      </p>

      <hr />

      <div className="example-placeholder">
        <h2>A worked example from my own research</h2>
        <p><em>[Space reserved — to be filled in by the site owner with a real example.]</em></p>
      </div>

      <Disclaimer />
    </article>
  );
}
