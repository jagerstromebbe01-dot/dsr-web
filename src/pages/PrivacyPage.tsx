import { CONTACT_URL, SITE_URL } from "../routes";

export function PrivacyPage() {
  return (
    <div className="article">
      <h1>Privacy policy</h1>
      <p className="hint">Last updated: 18 November 2026</p>

      <p>
        <strong>Short version:</strong> the calculators run in your browser and your numbers stay there. The only
        exceptions are the features that need our server — share links, the public API and the MCP server for AI
        assistants. Even then your data is used for the calculation and thrown away: it is never stored and never
        logged. There are no accounts, no cookies and no ads.
      </p>

      <h2>1. Calculations in your browser</h2>
      <p>
        On the <a href="/">backtest check</a> and the <a href="/calculator">calculator</a>, everything you type, paste
        or upload (returns, Sharpe ratio, number of strategies tried, and so on) is calculated locally in JavaScript in
        your browser. It is not sent to us or to anyone else.
      </p>

      <h2>2. When data is sent to our server</h2>
      <p>Your data is sent to our server only in these cases:</p>
      <ul>
        <li>
          <strong>Share link and README badge.</strong> If you click “Copy share link” or “Copy README badge”, your
          return series and settings are sent to our server once, so that it can recalculate the result and sign it.
        </li>
        <li>
          <strong>Public API</strong> (<code>POST {SITE_URL}/api/check</code>). Whatever you send in the request is
          processed to produce the response.
        </li>
        <li>
          <strong>MCP server</strong> (<code>{SITE_URL}/mcp</code>). If you connect an AI assistant such as ChatGPT or
          Claude to this server, the assistant sends the values you give it (a return series, or a Sharpe ratio and
          similar numbers) to our server when it uses one of our tools. The assistant&apos;s own provider has its own
          privacy policy for your conversation; this page only covers what happens on our server.
        </li>
      </ul>
      <p>
        In all these cases the data is processed in memory to calculate the answer and is then discarded. We do not
        store it, we do not write it to logs, we do not use it to train anything, and we do not share or sell it.
      </p>

      <h2>3. What a share link contains</h2>
      <p>
        A share link and a badge contain only a short summary of the result: the Deflated Sharpe Ratio, the verdict
        (green/yellow/red), the annualized Sharpe ratio, skewness, kurtosis, the number of observations, the number of
        strategies tried, and whether one input was estimated. They never contain your return series. The summary is
        signed with a secret key so that nobody can fake a “verified” result. Anyone who has the link can see these
        summary numbers, so share it only if you are comfortable with that.
      </p>

      <h2>4. Hosting and page-view statistics</h2>
      <p>
        This site is hosted on Cloudflare. Like any web host, Cloudflare handles technical request data (such as IP
        addresses) to deliver pages and protect the service, under Cloudflare&apos;s own privacy policy. We use{" "}
        <strong>Cloudflare Web Analytics</strong> to count anonymous page views. It does not use cookies and does not
        track you across sites. We cannot see what you entered into the tools.
      </p>

      <h2>5. Cookies and accounts</h2>
      <p>We set no cookies and there are no accounts or sign-ups. The API and MCP server need no API key.</p>

      <h2>6. Contact</h2>
      <p>
        Questions or requests about this policy: please open an issue at{" "}
        <a href={CONTACT_URL} rel="noopener">
          {CONTACT_URL}
        </a>
        .
      </p>

      <p className="disclaimer">
        Educational tool only — not investment advice. A green result is evidence, not proof of skill.
      </p>
    </div>
  );
}
