import { afterEach, describe, expect, it, vi } from "vitest";
import { runBacktestCheck } from "../../src/lib/check";
import { runStatsCheck } from "../../src/lib/checkFromStats";
import { SITE_URL } from "../../src/routes";
import { MAX_BODY_BYTES, RateLimiter } from "./checkApi";
import { SUPPORTED_PROTOCOL_VERSIONS, TOOLS, handleMcp } from "./mcp";
import { checkSignedParams } from "../../src/lib/share";

const env = { SHARE_SECRET: "test-secret-do-not-use" };
const fresh = () => new RateLimiter(1000, 60_000);

function series(T = 252): number[] {
  return Array.from({ length: T }, (_, i) => (i % 2 === 0 ? 0.015 : -0.005));
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "CF-Connecting-IP": "5.6.7.8", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function rpc(method: string, params?: unknown, e: { SHARE_SECRET?: string } = env, id: number = 1) {
  const res = await handleMcp(post({ jsonrpc: "2.0", id, method, params }), e, { limiter: fresh() });
  return { res, body: await res.json() };
}

async function callTool(name: string, args: unknown, e: { SHARE_SECRET?: string } = env) {
  const { body } = await rpc("tools/call", { name, arguments: args }, e);
  return body.result;
}

afterEach(() => vi.restoreAllMocks());

describe("MCP protocol (stateless Streamable HTTP)", () => {
  it("initialize: negotiates protocol version, advertises tools, no session id", async () => {
    const { res, body } = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "t", version: "1" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(res.headers.get("Mcp-Session-Id")).toBeNull();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.serverInfo.name).toBe("dsr-web");
    expect(body.result.instructions).toMatch(/INDEPENDENT/);
  });

  it("initialize with an unknown version answers with a supported one", async () => {
    const { body } = await rpc("initialize", { protocolVersion: "1999-01-01" });
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(body.result.protocolVersion);
  });

  it("notifications get 202 with no body", async () => {
    const res = await handleMcp(post({ jsonrpc: "2.0", method: "notifications/initialized" }), env, { limiter: fresh() });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("ping works", async () => {
    expect((await rpc("ping")).body.result).toEqual({});
  });

  it("tools/list: two read-only tools with usable descriptions and schemas", async () => {
    const { body } = await rpc("tools/list");
    const tools = body.result.tools;
    expect(tools.map((t: { name: string }) => t.name)).toEqual(["check_backtest", "dsr_from_stats"]);
    for (const t of tools) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
      expect(t.description).toMatch(/^ALWAYS call this tool/);
      expect(t.description).toMatch(/do not answer from memory/i);
      expect(t.description).toMatch(/does not need to name this tool/i);
      for (const trigger of ["Sharpe ratio", "backtest", "overfitting", "data mining", "multiple testing", "luck", "p-hacking", "too good to be true"]) {
        expect(t.description, `trigger: ${trigger}`).toContain(trigger);
      }
      expect(t.description).toMatch(/exact Deflated Sharpe Ratio calculation/);
      expect(t.description).toMatch(/skewness and kurtosis/);
      expect(t.description.length).toBeLessThan(2000);
      expect(t.description).toMatch(/not investment advice/i);
      expect(t.inputSchema.type).toBe("object");
      expect(JSON.stringify(t.inputSchema.properties.n.description)).toMatch(/INDEPENDENT/);
      expect(t.inputSchema.required).toContain("n");
    }
    expect(tools).toEqual(JSON.parse(JSON.stringify(TOOLS)));
  });

  it("each tool says when to use it versus the other, and check_backtest mentions the verifiable link", async () => {
    const { body } = await rpc("tools/list");
    const [check, stats] = body.result.tools;
    expect(check.description).toMatch(/dsr_from_stats instead/);
    expect(check.description).toMatch(/verify/i);
    expect(stats.description).toMatch(/check_backtest instead/);
    expect(stats.description).toContain("sharpe=1.5, sharpe_is_annual=true");
    expect(stats.description).toContain("t=1260, n=50");
  });

  it("server instructions tell the model to call the tools unprompted", async () => {
    const { body } = await rpc("initialize", { protocolVersion: "2025-06-18" });
    expect(body.result.instructions).toMatch(/WHENEVER a user asks whether a backtest/);
    expect(body.result.instructions).toMatch(/does not need to mention the tools/);
    expect(body.result.instructions).toMatch(/Do NOT answer such questions from memory/);
  });

  it("batches are answered as a batch; notifications inside are skipped", async () => {
    const res = await handleMcp(
      post([
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
      env,
      { limiter: fresh() },
    );
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((r: { id: number }) => r.id)).toEqual([1, 2]);
  });

  it("unknown method and unknown tool are JSON-RPC errors", async () => {
    expect((await rpc("resources/list")).body.error.code).toBe(-32601);
    const t = await rpc("tools/call", { name: "nope", arguments: {} });
    expect(t.body.error.code).toBe(-32602);
  });

  it("parse errors and invalid requests", async () => {
    const bad = await handleMcp(post("{nope"), env, { limiter: fresh() });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);
    const empty = await handleMcp(post([]), env, { limiter: fresh() });
    expect(empty.status).toBe(400);
    const notRpc = await handleMcp(post({ hello: "world" }), env, { limiter: fresh() });
    expect((await notRpc.json()).error.code).toBe(-32600);
  });

  it("GET/DELETE are 405 (stateless: no stream, no session); OPTIONS is CORS preflight", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await handleMcp(new Request("https://example.test/mcp", { method }), env);
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toMatch(/POST/);
    }
    const pre = await handleMcp(new Request("https://example.test/mcp", { method: "OPTIONS" }), env);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(pre.headers.get("Access-Control-Allow-Headers")).toMatch(/Mcp-Session-Id/i);
  });

  it("413 for oversized bodies", async () => {
    const huge = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_backtest", arguments: { returns: Array(MAX_BODY_BYTES / 4).fill(0.1) } } });
    const res = await handleMcp(post(huge), env, { limiter: fresh() });
    expect(res.status).toBe(413);
  });

  it("rate limits tools/call per IP (same budget idea as /api/check), but not initialize/list", async () => {
    const limiter = new RateLimiter(2, 60_000);
    const call = () => handleMcp(post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "dsr_from_stats", arguments: {} } }), env, { limiter, now: 0 });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    const list = await handleMcp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), env, { limiter, now: 0 });
    expect(list.status).toBe(200);
  });
});

describe("tool: check_backtest", () => {
  const args = { returns: series(), frequency: "daily", n: 20 };

  it("returns a short, retellable summary + structured numbers + a verifiable link", async () => {
    const r = await callTool("check_backtest", args);
    const expected = runBacktestCheck({ returns: series(), frequency: "daily", nTrials: 20 });
    expect(r.isError).toBeUndefined();
    const text: string = r.content[0].text;
    expect(text.split("\n").length).toBeLessThanOrEqual(7);
    expect(text).toContain(`DSR ${(expected.dsr * 100).toFixed(1)}%`);
    expect(text).toMatch(/Probably (a real edge|luck)|Uncertain/);
    expect(text).toContain("20 independent strategies");
    expect(text).toMatch(/not investment advice/);
    expect(r.structuredContent.verdict).toBe(expected.verdict);
    expect(r.structuredContent.dsr).toBeCloseTo(expected.dsr, 12);
    expect(r.structuredContent.T).toBe(252);

    const url: string = r.structuredContent.shareUrl;
    expect(url.startsWith(`${SITE_URL}/r?`)).toBe(true);
    expect(text).toContain(url);
    expect((await checkSignedParams(env.SHARE_SECRET, new URL(url).searchParams)).status).toBe("verified");
    expect(url).not.toContain("0.015"); // never the series
  });

  it("falls back to the site link when no SHARE_SECRET is configured", async () => {
    const r = await callTool("check_backtest", args, {});
    expect(r.structuredContent.shareUrl).toBeNull();
    expect(r.content[0].text).toContain(`${SITE_URL}/`);
  });

  it("accepts v and a custom frequency", async () => {
    const r = await callTool("check_backtest", { returns: series(120), frequency: "custom", periods_per_year: 12, n: 5, v: 0.01 });
    expect(r.structuredContent.vEstimated).toBe(false);
    expect(r.structuredContent.periodsPerYear).toBe(12);
  });

  const bad: Array<[string, Record<string, unknown>, RegExp]> = [
    ["no n", { returns: series(), frequency: "daily" }, /"n"/],
    ["n = 0", { ...args, n: 0 }, /whole number/],
    ["bad frequency", { ...args, frequency: "hourly" }, /frequency/],
    ["constant series", { returns: Array(50).fill(0.01), frequency: "daily", n: 5 }, /identical/],
    ["one value", { returns: [0.01], frequency: "daily", n: 5 }, /At least 2/],
    ["text in returns", { returns: [0.01, "x"], frequency: "daily", n: 5 }, /returns\[1\]/],
  ];
  for (const [name, a, msg] of bad) {
    it(`tool error (isError) for: ${name}`, async () => {
      const r = await callTool("check_backtest", a);
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(msg);
    });
  }

  it("enforces the same size limit as the API (100,000 returns)", async () => {
    const r = await callTool("check_backtest", { returns: Array(100_001).fill(0.001), frequency: "daily", n: 5 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/100000/);
  });
});

describe("tool: dsr_from_stats", () => {
  const args = { sharpe: 1.5, sharpe_is_annual: true, frequency: "daily", t: 1260, n: 50 };

  it("summarises DSR for stats, matching runStatsCheck, with a calculator link (no 'verified' link)", async () => {
    const r = await callTool("dsr_from_stats", args);
    const expected = runStatsCheck({ sharpe: 1.5, sharpeIsAnnual: true, frequency: "daily", T: 1260, nTrials: 50 });
    expect(r.isError).toBeUndefined();
    const text: string = r.content[0].text;
    expect(text).toContain(`DSR ${(expected.dsr * 100).toFixed(1)}%`);
    expect(text).toContain("50 independent strategies");
    expect(text).toContain(`${SITE_URL}/calculator`);
    expect(text).not.toContain("/r?");
    expect(r.structuredContent.dsr).toBeCloseTo(expected.dsr, 12);
    expect(r.structuredContent.shareUrl).toBeUndefined();
  });

  it("uses skew, kurtosis, v, per-period Sharpe", async () => {
    const r = await callTool("dsr_from_stats", { ...args, sharpe: 0.09, sharpe_is_annual: false, skew: -0.5, kurtosis: 6, v: 0.001 });
    const expected = runStatsCheck({ sharpe: 0.09, sharpeIsAnnual: false, frequency: "daily", T: 1260, nTrials: 50, skew: -0.5, kurtosis: 6, varianceOfTrialSharpes: 0.001 });
    expect(r.structuredContent.dsr).toBeCloseTo(expected.dsr, 12);
    expect(r.structuredContent.vEstimated).toBe(false);
  });

  const bad: Array<[string, Record<string, unknown>, RegExp]> = [
    ["missing t", { sharpe: 1, sharpe_is_annual: true, frequency: "daily", n: 5 }, /"t" is required/],
    ["sharpe as text", { ...args, sharpe: "1.5" }, /"sharpe" must be a number/],
    ["missing sharpe_is_annual", { sharpe: 1, frequency: "daily", t: 100, n: 5 }, /sharpe_is_annual/],
    ["bad frequency", { ...args, frequency: "yearly" }, /frequency/],
    ["n = 0", { ...args, n: 0 }, /at least 1/],
    ["kurtosis below 1", { ...args, kurtosis: 0.2 }, /Kurtosis/],
    ["t = 1", { ...args, t: 1 }, /greater than 1/],
  ];
  for (const [name, a, msg] of bad) {
    it(`tool error (isError) for: ${name}`, async () => {
      const r = await callTool("dsr_from_stats", a);
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(msg);
    });
  }
});

describe("privacy", () => {
  it("never writes to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await callTool("check_backtest", { returns: series(), frequency: "daily", n: 5 });
    await callTool("check_backtest", { returns: [1], frequency: "daily", n: 5 });
    await callTool("dsr_from_stats", { sharpe: 1, sharpe_is_annual: true, frequency: "daily", t: 100, n: 5 });
    await handleMcp(post("{bad"), env, { limiter: fresh() });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
