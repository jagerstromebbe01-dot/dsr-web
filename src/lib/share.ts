/**
 * Signed share links.
 *
 * A share link carries ONLY a small summary of a result (never the return
 * series) plus an HMAC-SHA256 signature made with a secret key that lives
 * in a Cloudflare secret (SHARE_SECRET), not in this code. Without the key
 * nobody can produce a valid signature, so nobody can mint a "verified"
 * badge for made-up numbers; any change to a signed value invalidates it.
 *
 * Uses only WebCrypto (`crypto.subtle`), which exists in Cloudflare Workers
 * and in Node 20+.
 */

import type { Verdict } from "./thresholds";

export interface ShareSummary {
  dsr: number;
  verdict: Verdict;
  /** ANNUALIZED Sharpe ratio. */
  sharpe: number;
  skew: number;
  /** Non-excess (normal = 3). */
  kurtosis: number;
  T: number;
  N: number;
  vEstimated: boolean;
}

/** The pieces of a check result a summary is built from. */
export interface SummarySource {
  dsr: number;
  verdict: Verdict;
  sharpeAnnualized: number;
  skew: number;
  kurtosis: number;
  T: number;
  N: number;
  vEstimated: boolean;
}

const VERDICTS: readonly Verdict[] = ["green", "yellow", "red"];

/** Rounds exactly as the canonical string prints, so sign/verify always agree. */
export function summaryFromResult(r: SummarySource): ShareSummary {
  return {
    dsr: Number(r.dsr.toFixed(4)),
    verdict: r.verdict,
    sharpe: Number(r.sharpeAnnualized.toFixed(2)),
    skew: Number(r.skew.toFixed(2)),
    kurtosis: Number(r.kurtosis.toFixed(2)),
    T: r.T,
    N: r.N,
    vEstimated: r.vEstimated,
  };
}

/** Fixed field order and formatting: this exact string is what gets signed. */
export function canonicalString(s: ShareSummary): string {
  return [
    `dsr=${s.dsr.toFixed(4)}`,
    `verdict=${s.verdict}`,
    `sharpe=${s.sharpe.toFixed(2)}`,
    `skew=${s.skew.toFixed(2)}`,
    `kurtosis=${s.kurtosis.toFixed(2)}`,
    `T=${s.T}`,
    `N=${s.N}`,
    `vEstimated=${s.vEstimated ? 1 : 0}`,
  ].join("&");
}

/**
 * Reads a summary out of URL parameters. Strict: every field must be
 * present and well-formed, otherwise null. Does NOT check the signature.
 */
export function parseSummaryParams(params: URLSearchParams): ShareSummary | null {
  const num = (key: string, min: number, max: number): number | null => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const int = (key: string, min: number, max: number): number | null => {
    const n = num(key, min, max);
    return n !== null && Number.isInteger(n) ? n : null;
  };

  const dsr = num("dsr", 0, 1);
  const sharpe = num("sharpe", -1000, 1000);
  const skew = num("skew", -1000, 1000);
  const kurtosis = num("kurtosis", 0, 1_000_000);
  const T = int("T", 2, 1_000_000_000);
  const N = int("N", 1, 1_000_000_000);
  const e = int("vEstimated", 0, 1);
  const verdict = params.get("verdict") as Verdict | null;

  if (dsr === null || sharpe === null || skew === null || kurtosis === null || T === null || N === null || e === null) {
    return null;
  }
  if (!verdict || !VERDICTS.includes(verdict)) return null;

  return { dsr, verdict, sharpe, skew, kurtosis, T, N, vEstimated: e === 1 };
}

// ---- HMAC ----------------------------------------------------------------

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signSummary(secret: string, summary: ShareSummary): Promise<string> {
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(canonicalString(summary)));
  return toBase64Url(new Uint8Array(mac));
}

/** Constant-time verification (crypto.subtle.verify). False for any malformed input. */
export async function verifySummary(secret: string, summary: ShareSummary, signature: string): Promise<boolean> {
  const sigBytes = fromBase64Url(signature);
  if (!sigBytes) return false;
  const key = await importKey(secret, "verify");
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    encoder.encode(canonicalString(summary)),
  );
}

/** The query string of a signed link: the canonical summary plus `&sig=...`. */
export async function buildSignedQuery(secret: string, summary: ShareSummary): Promise<string> {
  return `${canonicalString(summary)}&sig=${await signSummary(secret, summary)}`;
}

/** What a viewer of /r or /badge.svg gets to know about a link. */
export type LinkStatus =
  | { status: "verified"; summary: ShareSummary }
  | { status: "unverified"; summary: ShareSummary }
  | { status: "invalid" };

export async function checkSignedParams(secret: string | undefined, params: URLSearchParams): Promise<LinkStatus> {
  const summary = parseSummaryParams(params);
  if (!summary) return { status: "invalid" };
  const sig = params.get("sig");
  if (!secret || !sig) {
    return { status: "unverified", summary };
  }
  return (await verifySummary(secret, summary, sig))
    ? { status: "verified", summary }
    : { status: "unverified", summary };
}
