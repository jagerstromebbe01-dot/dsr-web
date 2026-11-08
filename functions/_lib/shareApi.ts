/**
 * GET /r?...        — human-readable result page for a signed share link
 * GET /badge.svg?...— small SVG badge for the same signed parameters
 *
 * Both only ever see the summary in the URL (never a return series) and
 * both verify the HMAC signature with env.SHARE_SECRET. Links that are
 * unsigned, altered, or checked on a server without the secret are shown as
 * "unverified" — never as verified.
 */

import { DSR_TIER_COLORS } from "../../src/lib/color";
import { buildSignedQuery, checkSignedParams, summaryFromResult } from "../../src/lib/share";
import type { LinkStatus, ShareSummary, SummarySource } from "../../src/lib/share";
import type { Verdict } from "../../src/lib/thresholds";
import type { Env } from "./checkApi";

const VERDICT_WORDS: Record<Verdict, { title: string; short: string }> = {
  green: { title: "Probably a real edge", short: "likely real" },
  yellow: { title: "Uncertain", short: "uncertain" },
  red: { title: "Probably luck", short: "likely luck" },
};

const EMOJI: Record<Verdict, string> = { green: "🟢", yellow: "🟡", red: "🔴" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const pct = (dsr: number) => `${(dsr * 100).toFixed(1)}%`;

/** Builds the signed links the API hands out. Returns nulls when no secret is configured. */
export async function buildShareLinks(
  origin: string,
  env: Env,
  result: SummarySource,
): Promise<{ shareUrl: string | null; badgeMarkdown: string | null }> {
  if (!env.SHARE_SECRET) return { shareUrl: null, badgeMarkdown: null };
  const query = await buildSignedQuery(env.SHARE_SECRET, summaryFromResult(result));
  const shareUrl = `${origin}/r?${query}`;
  const badgeUrl = `${origin}/badge.svg?${query}`;
  return { shareUrl, badgeMarkdown: `[![DSR check](${badgeUrl})](${shareUrl})` };
}

// ---- /badge.svg ------------------------------------------------------------

const GREY = "#9ca3af";

export function renderBadge(link: LinkStatus): string {
  const label = "DSR";
  let message: string;
  let color: string;
  if (link.status === "verified") {
    message = `${pct(link.summary.dsr)} · ${VERDICT_WORDS[link.summary.verdict].short}`;
    color = DSR_TIER_COLORS[link.summary.verdict];
  } else {
    message = "unverified";
    color = GREY;
  }
  const charW = 6.4;
  const labelW = Math.round(label.length * charW + 14);
  const msgW = Math.round(message.length * charW + 14);
  const total = labelW + msgW;
  const aria = `${label}: ${message}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${esc(aria)}">` +
    `<title>${esc(aria)}</title>` +
    `<clipPath id="r"><rect width="${total}" height="20" rx="3"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${labelW}" height="20" fill="#4b5563"/><rect x="${labelW}" width="${msgW}" height="20" fill="${color}"/></g>` +
    `<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">` +
    `<text x="${labelW / 2}" y="14" fill="#fff">${esc(label)}</text>` +
    `<text x="${labelW + msgW / 2}" y="14" fill="#111827" font-weight="bold">${esc(message)}</text>` +
    `</g></svg>`
  );
}

export async function handleBadge(request: Request, env: Env): Promise<Response> {
  const link = await checkSignedParams(env.SHARE_SECRET, new URL(request.url).searchParams);
  const immutable = link.status === "verified"; // signed values can never change -> cache for a year
  return new Response(renderBadge(link), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}

// ---- /r --------------------------------------------------------------------

function valuesTable(s: ShareSummary): string {
  const rows: Array<[string, string]> = [
    ["Deflated Sharpe Ratio (DSR)", pct(s.dsr)],
    ["Sharpe ratio (annualized)", s.sharpe.toFixed(2)],
    ["Skewness", s.skew.toFixed(2)],
    ["Kurtosis (normal = 3)", s.kurtosis.toFixed(2)],
    ["Observations (T)", String(s.T)],
    ["Strategies tried (N)", String(s.N)],
    ["Variance of trial Sharpes (V)", s.vEstimated ? "estimated" : "measured"],
  ];
  return rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
}

export function renderResultPage(link: LinkStatus, origin: string): string {
  let head: string;
  let body: string;
  let ogTitle: string;

  if (link.status === "invalid") {
    ogTitle = "Backtest check result";
    head = "Invalid result link";
    body = `<p class="banner bad">This link is not a valid result link.</p>`;
  } else if (link.status === "unverified") {
    ogTitle = "Unverified backtest check result";
    head = "Unverified result";
    body =
      `<p class="banner bad"><strong>Unverified.</strong> This link was not signed by this site, or it was changed. ` +
      `The numbers below may be made up — do not rely on them.</p>` +
      `<table>${valuesTable(link.summary)}</table>`;
  } else {
    const s = link.summary;
    const w = VERDICT_WORDS[s.verdict];
    ogTitle = `DSR ${pct(s.dsr)} — ${w.title} (verified)`;
    head = `${EMOJI[s.verdict]} ${w.title}`;
    body =
      `<p class="banner ok"><strong>Verified.</strong> These numbers were calculated by this site from a return series ` +
      `and signed. The return series itself is not stored and is not part of this link.</p>` +
      `<table>${valuesTable(s)}</table>` +
      (s.vEstimated
        ? `<p class="note">“Estimated” V: the spread of Sharpe ratios across the tried strategies was not given, so the other strategies were assumed to be pure noise. The verdict is an estimate.</p>`
        : "");
  }

  const colour = link.status === "verified" ? DSR_TIER_COLORS[link.summary.verdict] : GREY;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(ogTitle)}</title>
<meta property="og:title" content="${esc(ogTitle)}" />
<meta property="og:image" content="${esc(origin)}/og-image.png" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb;--panel:#f9fafb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1117;--fg:#e5e7eb;--muted:#9ca3af;--line:#2a2f3a;--panel:#171a22}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:32px 20px}
h1{font-size:1.9rem;margin:0 0 16px;border-left:6px solid ${colour};padding-left:12px}
.banner{padding:12px 14px;border-radius:8px;background:var(--panel);border:1px solid var(--line)}
.ok{border-color:#34d399}.bad{border-color:#f87171}
table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}
th{font-weight:500;color:var(--muted)}td{font-weight:700}
.note,.small{color:var(--muted);font-size:.9rem}
a{color:inherit}
</style>
</head>
<body>
<main>
<h1>${head}</h1>
${body}
<p><a href="/">Check your own backtest →</a></p>
<p class="small">Educational tool only — not investment advice. A green result is evidence, not proof of skill.</p>
</main>
</body>
</html>`;
}

export async function handleResultPage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const link = await checkSignedParams(env.SHARE_SECRET, url.searchParams);
  return new Response(renderResultPage(link, url.origin), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": link.status === "verified" ? "public, max-age=86400" : "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
