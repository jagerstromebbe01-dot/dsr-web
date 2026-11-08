import { afterEach, describe, expect, it, vi } from "vitest";
import { runBacktestCheck } from "../../src/lib/check";
import {
  MAX_BODY_BYTES,
  MAX_RETURNS,
  RateLimiter,
  handleCheck,
  handleMethodNotAllowed,
  handleOptions,
} from "./checkApi";

const env = {};

function series(T = 252): number[] {
  return Array.from({ length: T }, (_, i) => (i % 2 === 0 ? 0.015 : -0.005));
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const fresh = () => new RateLimiter(1000, 60_000);

afterEach(() => vi.restoreAllMocks());

describe("POST /api/check", () => {
  it("returns exactly what runBacktestCheck returns (no duplicated logic)", async () => {
    const returns = series();
    const res = await handleCheck(post({ returns, frequency: "daily", n: 20 }), env, { limiter: fresh() });
    expect(res.status).toBe(200);
    const body = await res.json();
    const expected = runBacktestCheck({ returns, frequency: "daily", nTrials: 20 });
    const { shareUrl, badgeMarkdown, ...core } = body;
    expect(core).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(shareUrl).toBeNull(); // no SHARE_SECRET in this test env
    expect(badgeMarkdown).toBeNull();
    expect(body.verdict).toMatch(/green|yellow|red/);
  });

  it("accepts v and custom frequency", async () => {
    const res = await handleCheck(
      post({ returns: series(), frequency: "custom", customPeriodsPerYear: 12, n: 5, v: 0.01 }),
      env,
      { limiter: fresh() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vEstimated).toBe(false);
    expect(body.periodsPerYear).toBe(12);
  });

  const bad: Array<[string, unknown, RegExp]> = [
    ["invalid JSON", "{nope", /not valid JSON/],
    ["array body", [1, 2], /JSON object/],
    ["missing returns", { frequency: "daily", n: 5 }, /"returns"/],
    ["non-number in returns", { returns: [0.1, "x", 0.2], frequency: "daily", n: 5 }, /returns\[1\]/],
    ["bad frequency", { returns: series(), frequency: "hourly", n: 5 }, /"frequency"/],
    ["missing n", { returns: series(), frequency: "daily" }, /"n"/],
    ["fractional n", { returns: series(), frequency: "daily", n: 2.5 }, /whole number/],
    ["n = 0", { returns: series(), frequency: "daily", n: 0 }, /whole number/],
    ["empty series", { returns: [], frequency: "daily", n: 5 }, /empty/],
    ["one observation", { returns: [0.01], frequency: "daily", n: 5 }, /At least 2/],
    ["constant series", { returns: Array(50).fill(0.01), frequency: "daily", n: 5 }, /identical/],
    ["negative v", { returns: series(), frequency: "daily", n: 5, v: -1 }, /V/],
    ["string v", { returns: series(), frequency: "daily", n: 5, v: "1" }, /"v"/],
  ];
  for (const [name, body, message] of bad) {
    it(`400 with a clear message: ${name}`, async () => {
      const res = await handleCheck(post(body), env, { limiter: fresh() });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(message);
    });
  }

  it("rejects more than MAX_RETURNS values", async () => {
    const res = await handleCheck(post({ returns: Array(MAX_RETURNS + 1).fill(0.001), frequency: "daily", n: 5 }), env, {
      limiter: fresh(),
    });
    expect([400, 413]).toContain(res.status);
  });

  it("413 when the declared body size is too big", async () => {
    const res = await handleCheck(post({ returns: series(), frequency: "daily", n: 5 }, { "Content-Length": String(MAX_BODY_BYTES + 1) }), env, {
      limiter: fresh(),
    });
    expect(res.status).toBe(413);
  });

  it("413 when the real body exceeds the limit (no/lying Content-Length)", async () => {
    const huge = JSON.stringify({ returns: Array(MAX_BODY_BYTES / 4).fill(0.1), frequency: "daily", n: 5 });
    expect(huge.length).toBeGreaterThan(MAX_BODY_BYTES);
    const res = await handleCheck(post(huge), env, { limiter: fresh() });
    expect(res.status).toBe(413);
  });

  it("CORS headers on success and on errors", async () => {
    const ok = await handleCheck(post({ returns: series(), frequency: "daily", n: 5 }), env, { limiter: fresh() });
    const err = await handleCheck(post("{bad"), env, { limiter: fresh() });
    for (const r of [ok, err, handleOptions(), handleMethodNotAllowed()]) {
      expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
    expect(handleOptions().status).toBe(204);
    expect(handleOptions().headers.get("Access-Control-Allow-Headers")).toMatch(/Content-Type/);
  });

  it("405 for other methods, with Allow header", () => {
    const r = handleMethodNotAllowed();
    expect(r.status).toBe(405);
    expect(r.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("never writes to the console (nothing is logged)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await handleCheck(post({ returns: series(), frequency: "daily", n: 5 }), env, { limiter: fresh() });
    await handleCheck(post("{bad"), env, { limiter: fresh() });
    await handleCheck(post({ returns: [1], frequency: "daily", n: 5 }), env, { limiter: fresh() });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe("rate limiting", () => {
  it("allows `limit` requests per window per IP, then 429 with Retry-After", async () => {
    const limiter = new RateLimiter(3, 60_000);
    const req = () => post({ returns: series(), frequency: "daily", n: 5 });
    for (let i = 0; i < 3; i++) expect((await handleCheck(req(), env, { limiter, now: 1000 })).status).toBe(200);
    const blocked = await handleCheck(req(), env, { limiter, now: 2000 });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("counts IPs separately and resets after the window", async () => {
    const limiter = new RateLimiter(1, 60_000);
    const mk = (ip: string) => post({ returns: series(), frequency: "daily", n: 5 }, { "CF-Connecting-IP": ip });
    expect((await handleCheck(mk("a"), env, { limiter, now: 0 })).status).toBe(200);
    expect((await handleCheck(mk("a"), env, { limiter, now: 1 })).status).toBe(429);
    expect((await handleCheck(mk("b"), env, { limiter, now: 1 })).status).toBe(200);
    expect((await handleCheck(mk("a"), env, { limiter, now: 60_001 })).status).toBe(200);
  });
});
