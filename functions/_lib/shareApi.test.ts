import { describe, expect, it } from "vitest";
import { runBacktestCheck } from "../../src/lib/check";
import { handleCheck, RateLimiter } from "./checkApi";
import { handleBadge, handleResultPage, renderBadge } from "./shareApi";

const env = { SHARE_SECRET: "test-secret-do-not-use" };

function series(T = 252): number[] {
  return Array.from({ length: T }, (_, i) => (i % 2 === 0 ? 0.015 : -0.005));
}

async function getLinks(secretEnv: { SHARE_SECRET?: string } = env) {
  const req = new Request("https://dsr.test/api/check", {
    method: "POST",
    headers: { "CF-Connecting-IP": "9.9.9.9" },
    body: JSON.stringify({ returns: series(), frequency: "daily", n: 20 }),
  });
  const res = await handleCheck(req, secretEnv, { limiter: new RateLimiter(100, 60_000) });
  return res.json();
}

const get = (url: string) => new Request(url);

describe("API share fields", () => {
  it("returns shareUrl and badgeMarkdown when SHARE_SECRET is set", async () => {
    const body = await getLinks();
    expect(body.shareUrl).toMatch(/^https:\/\/dsr\.test\/r\?dsr=.*&sig=[A-Za-z0-9_-]{43}$/);
    expect(body.badgeMarkdown).toMatch(/^\[!\[DSR check\]\(https:\/\/dsr\.test\/badge\.svg\?.*&sig=.*\)\]\(https:\/\/dsr\.test\/r\?.*\)$/);
  });

  it("the shared link never contains the return series", async () => {
    const body = await getLinks();
    expect(body.shareUrl.length).toBeLessThan(400);
    expect(body.shareUrl).not.toContain("returns");
    expect(body.shareUrl).not.toContain("0.015");
  });

  it("returns nulls (not fake links) when no secret is configured", async () => {
    const body = await getLinks({});
    expect(body.shareUrl).toBeNull();
    expect(body.badgeMarkdown).toBeNull();
  });
});

describe("/r result page", () => {
  it("shows a freshly signed link as verified, with the right numbers", async () => {
    const { shareUrl } = await getLinks();
    const res = await handleResultPage(get(shareUrl), env);
    const html = await res.text();
    const expected = runBacktestCheck({ returns: series(), frequency: "daily", nTrials: 20 });
    expect(res.status).toBe(200);
    expect(html).toContain("Verified.");
    expect(html).not.toContain("Unverified");
    expect(html).toContain(`${(expected.dsr * 100).toFixed(1)}%`);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=86400/);
  });

  it("shows a tampered link as unverified", async () => {
    const { shareUrl } = await getLinks();
    const tampered = shareUrl.replace(/dsr=[0-9.]+/, "dsr=0.9999");
    const html = await (await handleResultPage(get(tampered), env)).text();
    expect(html).toContain("Unverified.");
    expect(html).not.toContain("Verified.</strong>");
  });

  it("shows an unsigned link as unverified", async () => {
    const { shareUrl } = await getLinks();
    const unsigned = shareUrl.replace(/&sig=.*$/, "");
    expect(await (await handleResultPage(get(unsigned), env)).text()).toContain("Unverified.");
  });

  it("shows a link as unverified on a server without a secret", async () => {
    const { shareUrl } = await getLinks();
    expect(await (await handleResultPage(get(shareUrl), {})).text()).toContain("Unverified.");
  });

  it("is safe against HTML injection through parameters", async () => {
    const { shareUrl } = await getLinks();
    const evil = shareUrl.replace("verdict=green", encodeURIComponent('verdict="><script>alert(1)</script>').replace(/^/, "verdict="));
    const html = await (await handleResultPage(get(evil), env)).text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("not a valid result link");
  });
});

describe("/badge.svg", () => {
  it("verified badge: SVG with DSR percentage, tier colour and long immutable cache", async () => {
    const { shareUrl } = await getLinks();
    const res = await handleBadge(get(shareUrl.replace("/r?", "/badge.svg?")), env);
    const svg = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/image\/svg\+xml/);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/DSR: \d+\.\d% · likely real/);
    expect(svg).toContain("#34d399"); // green tier colour
  });

  it("tampered / unsigned / invalid parameters give a grey 'unverified' badge with a short cache", async () => {
    const { shareUrl } = await getLinks();
    const badge = shareUrl.replace("/r?", "/badge.svg?");
    for (const url of [badge.replace(/dsr=[0-9.]+/, "dsr=0.9999"), badge.replace(/&sig=.*$/, ""), "https://dsr.test/badge.svg?x=1"]) {
      const res = await handleBadge(get(url), env);
      const svg = await res.text();
      expect(svg).toContain("unverified");
      expect(svg).toContain("#9ca3af");
      expect(svg).not.toContain("likely real");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    }
  });

  it("badge colours follow the verdict", () => {
    const base = { dsr: 0.7, sharpe: 1, skew: 0, kurtosis: 3, T: 100, N: 5, vEstimated: false };
    expect(renderBadge({ status: "verified", summary: { ...base, verdict: "yellow" } })).toContain("#fbbf24");
    expect(renderBadge({ status: "verified", summary: { ...base, dsr: 0.1, verdict: "red" } })).toContain("#f87171");
  });
});
