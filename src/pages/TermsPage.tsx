import { CONTACT_URL, SITE_URL } from "../routes";

export function TermsPage() {
  return (
    <div className="article">
      <h1>Terms of use</h1>
      <p className="hint">Last updated: 18 November 2026</p>

      <h2>1. Free and for education</h2>
      <p>
        This website, its calculators, the public API (<code>{SITE_URL}/api/check</code>) and the MCP server (
        <code>{SITE_URL}/mcp</code>) are free to use and provided for educational purposes. By using them you agree to
        these terms.
      </p>

      <h2>2. Not financial advice</h2>
      <p>
        Nothing here is investment, financial, legal or tax advice, and nothing is a recommendation to buy or sell
        anything. A green, yellow or red result is a statistical estimate, not a prediction of future returns. Past
        performance does not predict future results. You are solely responsible for your own decisions.
      </p>

      <h2>3. No warranty</h2>
      <p>
        The service is provided “as is” and “as available”. We make no promise that results are correct, complete or
        suitable for any purpose, or that the service will be available without interruption. The calculations rest on
        assumptions (for example, that the number of strategies tried is stated honestly and that unknown inputs can
        be estimated) and can be wrong.
      </p>

      <h2>4. No liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for any loss or damage — including financial losses
        — arising from the use of, or inability to use, the service or from relying on its results.
      </p>

      <h2>5. Fair use of the API and MCP server</h2>
      <p>
        Use the API and MCP server reasonably. Do not overload them, try to get around the rate limits or size limits,
        attempt to break or probe the service, or use it for anything unlawful. We may limit or block abusive use
        without notice. Do not present a result as “verified” unless it comes from a link or badge signed by this
        site.
      </p>

      <h2>6. Your data</h2>
      <p>
        How data is handled is described in the <a href="/privacy">privacy policy</a>.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may change the service or these terms at any time. The date above shows the latest update; continuing to
        use the service after a change means you accept the new terms.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about these terms:{" "}
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
