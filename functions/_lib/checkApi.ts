/**
 * POST /api/check — the public backtest-check API.
 *
 * PRIVACY: the submitted returns are processed in memory and thrown away.
 * They are never stored and never logged. This file must not contain any
 * console.* call that includes request content — a test enforces that no
 * console output happens at all.
 */

import { CheckInputError, runBacktestCheck } from "../../src/lib/check";
import type { CheckResult } from "../../src/lib/check";
import type { DataFrequency } from "../../src/lib/dsr";
import { buildShareLinks, publicBaseUrl } from "./shareApi";

export interface Env {
  /** HMAC key for signed share links / badges (Cloudflare secret). */
  SHARE_SECRET?: string;
}

export const MAX_BODY_BYTES = 1_000_000; // 1 MB
export const MAX_RETURNS = 100_000;
export const RATE_LIMIT_REQUESTS = 30; // per IP ...
export const RATE_LIMIT_WINDOW_MS = 60_000; // ... per minute

const FREQUENCIES: readonly DataFrequency[] = ["daily", "daily_crypto", "weekly", "monthly", "custom"];

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// ---------------------------------------------------------------------------
// Rate limiting: fixed window per IP, kept in memory of the running Worker
// instance. Best effort only (see README / docs): different instances do not
// share counters. Real protection = a Cloudflare WAF rate-limiting rule.
// ---------------------------------------------------------------------------

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Returns 0 if allowed, otherwise the number of seconds to wait. */
  check(key: string, now: number): number {
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
      if (this.hits.size > 5000) this.hits.clear(); // under attack: reset rather than grow without bound
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }
}

export const defaultLimiter = new RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS);

// ---------------------------------------------------------------------------

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function errorResponse(status: number, message: string, extraHeaders: Record<string, string> = {}): Response {
  return jsonResponse({ error: message }, status, extraHeaders);
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function handleMethodNotAllowed(): Response {
  return errorResponse(405, "Use POST with a JSON body. See /api for documentation.", { Allow: "POST, OPTIONS" });
}

/** Reads the body as text but gives up as soon as it exceeds maxBytes. */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

type Parsed = { ok: true; input: Parameters<typeof runBacktestCheck>[0] } | { ok: false; error: string };

export function parseCheckRequest(body: unknown): Parsed {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object like {"returns": [...], "frequency": "daily", "n": 20}.' };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.returns)) return { ok: false, error: '"returns" must be an array of numbers (decimal returns per period, 0.01 = 1 %).' };
  if (b.returns.length > MAX_RETURNS) {
    return { ok: false, error: `"returns" has ${b.returns.length} values; the maximum is ${MAX_RETURNS}.` };
  }
  for (let i = 0; i < b.returns.length; i++) {
    if (typeof b.returns[i] !== "number") return { ok: false, error: `"returns[${i}]" is not a number.` };
  }

  if (typeof b.frequency !== "string" || !FREQUENCIES.includes(b.frequency as DataFrequency)) {
    return { ok: false, error: `"frequency" must be one of: ${FREQUENCIES.join(", ")}.` };
  }
  if (typeof b.n !== "number") return { ok: false, error: '"n" (number of independent strategies tried) must be a number.' };
  if (b.v !== undefined && typeof b.v !== "number") {
    return { ok: false, error: '"v" must be a number (variance of the per-period Sharpe ratios across your trials) or omitted.' };
  }
  if (b.customPeriodsPerYear !== undefined && typeof b.customPeriodsPerYear !== "number") {
    return { ok: false, error: '"customPeriodsPerYear" must be a number or omitted.' };
  }

  return {
    ok: true,
    input: {
      returns: b.returns as number[],
      frequency: b.frequency as DataFrequency,
      customPeriodsPerYear: b.customPeriodsPerYear as number | undefined,
      nTrials: b.n,
      varianceOfTrialSharpes: b.v as number | undefined,
    },
  };
}

export type CheckResponseBody = CheckResult & {
  /** Signed link to a result page, or null if the server has no SHARE_SECRET. */
  shareUrl: string | null;
  /** Markdown for a README badge linking to shareUrl, or null (see above). */
  badgeMarkdown: string | null;
};

export async function handleCheck(
  request: Request,
  env: Env,
  options: { limiter?: RateLimiter; now?: number } = {},
): Promise<Response> {
  const limiter = options.limiter ?? defaultLimiter;
  const now = options.now ?? Date.now();

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const wait = limiter.check(ip, now);
  if (wait > 0) {
    return errorResponse(429, `Too many requests. Try again in ${wait} seconds.`, { "Retry-After": String(wait) });
  }

  const text = await readBodyLimited(request, MAX_BODY_BYTES);
  if (text === null) return errorResponse(413, `Request body is larger than ${MAX_BODY_BYTES} bytes.`);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return errorResponse(400, "Body is not valid JSON.");
  }

  const parsed = parseCheckRequest(json);
  if (!parsed.ok) return errorResponse(400, parsed.error);

  let result: CheckResult;
  try {
    result = runBacktestCheck(parsed.input);
  } catch (e) {
    if (e instanceof CheckInputError) return errorResponse(400, e.message);
    return errorResponse(500, "Unexpected error while calculating.");
  }

  const links = await buildShareLinks(publicBaseUrl(request.url), env, result);
  const body: CheckResponseBody = { ...result, ...links };
  return jsonResponse(body);
}
