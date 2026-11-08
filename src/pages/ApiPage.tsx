const CURL_EXAMPLE = `curl -X POST https://dsr-web.pages.dev/api/check \\
  -H "Content-Type: application/json" \\
  -d '{
    "returns": [0.012, -0.004, 0.007, 0.001, -0.009, 0.015, 0.003, -0.002],
    "frequency": "daily",
    "n": 20
  }'`;

const PYTHON_EXAMPLE = `import requests

# Decimal returns per period (0.01 = 1 %), e.g. from your backtest.
returns = [0.012, -0.004, 0.007, 0.001, -0.009, 0.015, 0.003, -0.002]

resp = requests.post(
    "https://dsr-web.pages.dev/api/check",
    json={"returns": returns, "frequency": "daily", "n": 20},
    timeout=30,
)
data = resp.json()
if resp.ok:
    print(data["verdict"], data["dsr"])   # e.g. "red" 0.12
else:
    print("error:", data["error"])`;

const RESPONSE_EXAMPLE = `{
  "dsr": 0.101,
  "verdict": "red",
  "sharpe": 0.0276,
  "sharpeAnnualized": 0.44,
  "skew": -0.36,
  "kurtosis": 3.68,
  "T": 504,
  "N": 20,
  "vEstimated": true,
  "vUsed": 0.00199,
  "benchmarkSR": 0.085,
  "periodsPerYear": 252,
  "warnings": ["V (the spread of Sharpe ratios ...) is estimated ..."],
  "shareUrl": "https://dsr-web.pages.dev/r?dsr=0.1010&verdict=red&...&sig=...",
  "badgeMarkdown": "[![DSR check](https://dsr-web.pages.dev/badge.svg?...)](https://dsr-web.pages.dev/r?...)"
}`;

export function ApiPage() {
  return (
    <div className="article">
      <h1>Backtest check API</h1>
      <p>
        A free JSON API that answers the same question as the <a href="/">backtest check</a>: is this strategy&apos;s
        Sharpe ratio probably real, or just luck after trying many strategies? It uses the Deflated Sharpe Ratio
        (Bailey &amp; López de Prado, 2014). No sign-up, no API key.
      </p>
      <p>
        <strong>Privacy:</strong> the returns you send are used for the calculation and then discarded. They are never
        stored and never logged.
      </p>

      <h2>Request</h2>
      <p>
        <code>POST https://dsr-web.pages.dev/api/check</code> with a JSON body:
      </p>
      <ul>
        <li>
          <code>returns</code> — array of numbers: returns per period as decimals (0.01 = +1 %). At least 2 values, at
          most 100,000.
        </li>
        <li>
          <code>frequency</code> — <code>&quot;daily&quot;</code> (252/yr), <code>&quot;daily_crypto&quot;</code>{" "}
          (365/yr), <code>&quot;weekly&quot;</code>, <code>&quot;monthly&quot;</code> or{" "}
          <code>&quot;custom&quot;</code> (then also send <code>customPeriodsPerYear</code>).
        </li>
        <li>
          <code>n</code> — whole number ≥ 1: how many <em>independent</em> strategies you tried. 500 nearly identical
          variants do not count as 500.
        </li>
        <li>
          <code>v</code> — optional: variance of the per-period Sharpe ratios across your tried strategies. If left out,
          it is estimated as 1/(T−1) and the response says <code>vEstimated: true</code>.
        </li>
      </ul>

      <h2>curl</h2>
      <pre>{CURL_EXAMPLE}</pre>

      <h2>Python</h2>
      <pre>{PYTHON_EXAMPLE}</pre>

      <h2>Response</h2>
      <pre>{RESPONSE_EXAMPLE}</pre>
      <ul>
        <li>
          <code>verdict</code> — <code>&quot;green&quot;</code> (DSR ≥ 0.95, probably a real edge),{" "}
          <code>&quot;yellow&quot;</code> (0.50 to 0.95, uncertain) or <code>&quot;red&quot;</code> (below 0.50,
          probably luck).
        </li>
        <li>
          <code>sharpe</code> is per period; <code>sharpeAnnualized</code> is scaled by √(periods per year).{" "}
          <code>kurtosis</code> is the non-excess kind (normal = 3).
        </li>
        <li>
          <code>warnings</code> — things worth knowing, e.g. a short series or returns that look like percentages.
        </li>
      </ul>

      <h2>Share link and badge</h2>
      <p>
        Every response includes a signed <code>shareUrl</code> and ready-made <code>badgeMarkdown</code> for a GitHub
        README. The link carries only a summary (DSR, verdict, annualized Sharpe, skewness, kurtosis, T, N, whether V was
        estimated) — never your returns. It is signed by this site, so nobody can invent a &quot;verified&quot; result:
        a link that is altered or unsigned is shown as <em>unverified</em>.
      </p>

      <h2>Errors</h2>
      <ul>
        <li>
          <code>400</code> — invalid input; <code>{`{"error": "..."}`}</code> explains what to fix.
        </li>
        <li>
          <code>413</code> — request body larger than 1 MB.
        </li>
        <li>
          <code>429</code> — too many requests (about 30 per minute per IP); see the <code>Retry-After</code> header.
        </li>
      </ul>
      <p>
        CORS is open (<code>Access-Control-Allow-Origin: *</code>), so you can call the API from the browser too.
      </p>

      <p className="disclaimer">
        Educational tool only — not investment advice. A green result is evidence, not proof of skill.
      </p>
    </div>
  );
}
