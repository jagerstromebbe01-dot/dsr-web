import { describe, expect, it } from "vitest";
import {
  buildSignedQuery,
  canonicalString,
  checkSignedParams,
  parseSummaryParams,
  signSummary,
  summaryFromResult,
  verifySummary,
} from "./share";
import type { ShareSummary } from "./share";

const SECRET = "test-secret-do-not-use";

const summary: ShareSummary = {
  dsr: 0.9712,
  verdict: "green",
  sharpe: 1.87,
  skew: -0.36,
  kurtosis: 3.68,
  T: 504,
  N: 20,
  vEstimated: true,
};

describe("canonical string + signing", () => {
  it("has a fixed field order", () => {
    expect(canonicalString(summary)).toBe(
      "dsr=0.9712&verdict=green&sharpe=1.87&skew=-0.36&kurtosis=3.68&T=504&N=20&vEstimated=1",
    );
  });

  it("signs and verifies", async () => {
    const sig = await signSummary(SECRET, summary);
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32-byte HMAC, base64url
    expect(await verifySummary(SECRET, summary, sig)).toBe(true);
  });

  it("is deterministic", async () => {
    expect(await signSummary(SECRET, summary)).toBe(await signSummary(SECRET, summary));
  });

  it("rejects a wrong secret", async () => {
    const sig = await signSummary(SECRET, summary);
    expect(await verifySummary("another-secret", summary, sig)).toBe(false);
  });

  it("rejects a change to ANY signed field", async () => {
    const sig = await signSummary(SECRET, summary);
    const tampered: ShareSummary[] = [
      { ...summary, dsr: 0.9999 },
      { ...summary, verdict: "yellow" },
      { ...summary, sharpe: 3.0 },
      { ...summary, skew: 0.1 },
      { ...summary, kurtosis: 5 },
      { ...summary, T: 505 },
      { ...summary, N: 2 },
      { ...summary, vEstimated: false },
    ];
    for (const t of tampered) expect(await verifySummary(SECRET, t, sig), canonicalString(t)).toBe(false);
  });

  it("rejects malformed signatures without throwing", async () => {
    for (const bad of ["", "abc", "!!!", "A".repeat(43), "A".repeat(100)]) {
      expect(await verifySummary(SECRET, summary, bad)).toBe(false);
    }
  });
});

describe("parseSummaryParams", () => {
  const good = () => new URLSearchParams(canonicalString(summary));

  it("round-trips a canonical string", () => {
    expect(parseSummaryParams(good())).toEqual(summary);
  });

  it("returns null for missing, malformed or out-of-range fields", () => {
    const mutate = (k: string, v: string | null) => {
      const p = good();
      if (v === null) p.delete(k);
      else p.set(k, v);
      return parseSummaryParams(p);
    };
    for (const k of ["dsr", "verdict", "sharpe", "skew", "kurtosis", "T", "N", "vEstimated"]) {
      expect(mutate(k, null), `missing ${k}`).toBeNull();
    }
    expect(mutate("dsr", "1.5")).toBeNull();
    expect(mutate("dsr", "abc")).toBeNull();
    expect(mutate("verdict", "purple")).toBeNull();
    expect(mutate("verdict", '"><script>alert(1)</script>')).toBeNull();
    expect(mutate("T", "1.5")).toBeNull();
    expect(mutate("N", "0")).toBeNull();
    expect(mutate("vEstimated", "2")).toBeNull();
    expect(mutate("sharpe", "Infinity")).toBeNull();
  });
});

describe("checkSignedParams", () => {
  it("verified for an untouched signed link", async () => {
    const params = new URLSearchParams(await buildSignedQuery(SECRET, summary));
    expect(await checkSignedParams(SECRET, params)).toEqual({ status: "verified", summary });
  });

  it("unverified when a value was changed", async () => {
    const params = new URLSearchParams(await buildSignedQuery(SECRET, summary));
    params.set("dsr", "0.9999");
    expect((await checkSignedParams(SECRET, params)).status).toBe("unverified");
  });

  it("unverified when the signature is missing or wrong, or no secret is configured", async () => {
    const query = await buildSignedQuery(SECRET, summary);
    const noSig = new URLSearchParams(canonicalString(summary));
    expect((await checkSignedParams(SECRET, noSig)).status).toBe("unverified");
    expect((await checkSignedParams(SECRET, new URLSearchParams(query + "x"))).status).toBe("unverified");
    expect((await checkSignedParams(undefined, new URLSearchParams(query))).status).toBe("unverified");
  });

  it("a forged link signed with a guessed key is not verified", async () => {
    const forged = new URLSearchParams(await buildSignedQuery("attacker-key", summary));
    expect((await checkSignedParams(SECRET, forged)).status).toBe("unverified");
  });

  it("invalid when the summary itself is unreadable", async () => {
    expect((await checkSignedParams(SECRET, new URLSearchParams("foo=bar"))).status).toBe("invalid");
  });
});

describe("summaryFromResult", () => {
  it("rounds and uses the annualized Sharpe", () => {
    const s = summaryFromResult({
      dsr: 0.971234567,
      verdict: "green",
      sharpeAnnualized: 1.8749,
      skew: -0.3649,
      kurtosis: 3.6851,
      T: 504,
      N: 20,
      vEstimated: false,
    });
    expect(s).toEqual({ dsr: 0.9712, verdict: "green", sharpe: 1.87, skew: -0.36, kurtosis: 3.69, T: 504, N: 20, vEstimated: false });
  });
});
