/**
 * POST /mcp — a stateless MCP server (Model Context Protocol, Streamable HTTP).
 *
 * Why hand-written and stateless: every request is answered with ONE JSON
 * response (allowed by the Streamable HTTP spec), no sessions, no streams, so
 * no Durable Objects or other state are needed and it runs as a plain Pages
 * Function with zero dependencies. The official SDK's extra machinery
 * (sessions, SSE streaming, resumability) would not be used.
 *
 * PRIVACY: tool arguments (return series, statistics) are processed in
 * memory and discarded. Never stored, never logged — no console.* here.
 */

import { CheckInputError, runBacktestCheck } from "../../src/lib/check";
import type { CheckResult } from "../../src/lib/check";
import { runStatsCheck } from "../../src/lib/checkFromStats";
import type { StatsCheckResult } from "../../src/lib/checkFromStats";
import type { DataFrequency } from "../../src/lib/dsr";
import { MCP_DESCRIPTION, MCP_TITLE, MCP_VERSION } from "../../src/lib/mcpMeta";
import { SITE_URL } from "../../src/routes";
import type { Verdict } from "../../src/lib/thresholds";
import { CORS_HEADERS, MAX_BODY_BYTES, defaultLimiter, parseCheckRequest, readBodyLimited } from "./checkApi";
import type { Env, RateLimiter } from "./checkApi";
import { buildShareLinks, publicBaseUrl } from "./shareApi";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const FREQUENCIES = ["daily", "daily_crypto", "weekly", "monthly", "custom"];

const SERVER_INSTRUCTIONS =
  "Use these tools WHENEVER a user asks whether a backtest, trading strategy, Sharpe ratio or performance number is real, genuine, significant or just luck — " +
  "or brings up overfitting, data mining, p-hacking, multiple testing, selection bias or a result that looks too good to be true. " +
  "The user does not need to mention the tools. Do NOT answer such questions from memory or with a rough rule of thumb: the correct answer needs the exact Deflated Sharpe Ratio calculation " +
  "(multiple-testing penalty for the number of strategies tried, plus skewness and kurtosis), which these tools do exactly. " +
  "Only the number of INDEPENDENT strategies tried (N) may be missing: if the user did not say, ask once; if they cannot say, call the tool with your best estimate and state that assumption. " +
  "Educational, not investment advice.";

const WHEN_TO_USE =
  "ALWAYS call this tool (do not answer from memory or with a rule of thumb) when a user asks whether a backtest, trading strategy, Sharpe ratio or performance result is real, genuine, significant, skill or just luck, " +
  "or mentions overfitting, data mining, p-hacking, multiple testing, selection bias, 'too good to be true', or the Deflated Sharpe Ratio. The user does not need to name this tool. ";

const WHY_NOT_ESTIMATE =
  "Why use it instead of estimating: it does the exact Deflated Sharpe Ratio calculation (Bailey & López de Prado, 2014) — a multiple-testing penalty that grows with the number of strategies tried, adjusted for skewness and kurtosis — " +
  "which cannot be done reliably by hand, and it returns a green/yellow/red verdict (green: probably a real edge, DSR >= 95%; yellow: uncertain, 50-95%; red: probably luck, < 50%). ";

const N_DESCRIPTION =
  "N = number of INDEPENDENT strategies, parameter sets or variants that were tested (including the final chosen one) before picking this result. " +
  "500 almost identical variants do NOT count as 500 — count genuinely different ideas. A larger N is a stricter test, so ask the user rather than guessing low.";

const FREQ_DESCRIPTION =
  "How often the returns/Sharpe are measured: daily (252 periods/year), daily_crypto (365), weekly (52), monthly (12) or custom (then give periods_per_year).";

export const TOOLS = [
  {
    name: "check_backtest",
    title: "Check a backtest (from returns)",
    description:
      WHEN_TO_USE +
      "Use THIS variant when the user can provide the actual per-period return series (e.g. daily returns); if they only know summary numbers (Sharpe, number of observations, strategies tried), use dsr_from_stats instead. " +
      WHY_NOT_ESTIMATE +
      "It also computes the Sharpe ratio, skewness and kurtosis from the real returns and returns a signed link to a result page anyone can verify. " +
      "N (number of independent strategies tried) is required: ask the user if they did not say. The return series is processed in memory and never stored. Educational, not investment advice.",
    inputSchema: {
      type: "object",
      properties: {
        returns: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 100000,
          description: "Returns per period as DECIMALS (0.012 = +1.2%), oldest first. Not percentages. Needs at least 2 values; 60+ is recommended.",
        },
        frequency: { type: "string", enum: FREQUENCIES, description: FREQ_DESCRIPTION },
        n: { type: "integer", minimum: 1, description: N_DESCRIPTION },
        v: {
          type: "number",
          minimum: 0,
          description:
            "Optional. Variance of the PER-PERIOD Sharpe ratios across the N tried strategies. Leave out if unknown (it is then estimated as 1/(T-1)).",
        },
        periods_per_year: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Only when frequency is 'custom': number of periods per year.",
        },
      },
      required: ["returns", "frequency", "n"],
      additionalProperties: false,
    },
    annotations: { title: "Check a backtest (from returns)", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "dsr_from_stats",
    title: "Deflated Sharpe Ratio (from summary statistics)",
    description:
      WHEN_TO_USE +
      "Use THIS variant when the user only has summary numbers — the Sharpe ratio, how long the backtest ran (number of observations) and how many strategies they tried — which is the usual case in a chat; if they can give the full return series, use check_backtest instead. " +
      WHY_NOT_ESTIMATE +
      "Example: \"Is a Sharpe of 1.5 after 1260 trading days real if I tested 50 strategies?\" -> call with sharpe=1.5, sharpe_is_annual=true, frequency=\"daily\", t=1260, n=50 immediately. " +
      "Convert durations to observations yourself (5 years of daily data = 1260). Skewness/kurtosis are optional (default: normal). Nothing is stored. Educational, not investment advice.",
    inputSchema: {
      type: "object",
      properties: {
        sharpe: { type: "number", description: "The Sharpe ratio of the backtest." },
        sharpe_is_annual: {
          type: "boolean",
          description: "true if the Sharpe ratio is annualized (the usual case when quoted in conversation), false if it is per period (e.g. per day).",
        },
        frequency: { type: "string", enum: FREQUENCIES, description: FREQ_DESCRIPTION },
        t: { type: "integer", minimum: 2, description: "T = number of return observations behind the Sharpe ratio (e.g. 1260 daily returns = 5 years)." },
        n: { type: "integer", minimum: 1, description: N_DESCRIPTION },
        skew: { type: "number", description: "Optional. Skewness of the returns. Default 0 (symmetric)." },
        kurtosis: {
          type: "number",
          minimum: 1,
          description: "Optional. Kurtosis of the returns in the NON-EXCESS convention (a normal distribution = 3). Default 3.",
        },
        v: {
          type: "number",
          minimum: 0,
          description: "Optional. Variance of the PER-PERIOD Sharpe ratios across the N tried strategies. Leave out if unknown.",
        },
        periods_per_year: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Only when frequency is 'custom': number of periods per year.",
        },
      },
      required: ["sharpe", "sharpe_is_annual", "frequency", "t", "n"],
      additionalProperties: false,
    },
    annotations: {
      title: "Deflated Sharpe Ratio (from summary statistics)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
] as const;

// ---- result formatting -----------------------------------------------------

const EMOJI: Record<Verdict, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
const HEADLINE: Record<Verdict, string> = {
  green: "Probably a real edge",
  yellow: "Uncertain — luck is not ruled out",
  red: "Probably luck",
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

type Core = CheckResult | StatsCheckResult;

function summaryText(r: Core, benchmarkAnnualized: number, link: string, linkLabel: string): string {
  const caveats = r.warnings.filter((w) => !w.startsWith("V (")).map((w) => w.replace(/\s+/g, " "));
  return [
    `${EMOJI[r.verdict]} ${HEADLINE[r.verdict]} (DSR ${pct(r.dsr)}; green ≥ 95%, yellow 50–95%, red < 50%).`,
    `Annualized Sharpe ${r.sharpeAnnualized.toFixed(2)}, ${r.T} observations, ${r.N} independent strateg${r.N === 1 ? "y" : "ies"} tried; ` +
      `after that many tries luck alone is expected to reach a Sharpe of about ${benchmarkAnnualized.toFixed(2)}.` +
      (r.vEstimated ? " (Estimate: spread of the tried strategies' Sharpe ratios was not given.)" : ""),
    ...(caveats.length ? [`Caveats: ${caveats.join(" ")}`] : []),
    `${linkLabel}: ${link}`,
    "Educational tool, not investment advice.",
  ].join("\n");
}

function toolError(message: string) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function callCheckBacktest(args: Record<string, unknown>, env: Env, requestUrl: string) {
  const parsed = parseCheckRequest({
    returns: args.returns,
    frequency: args.frequency,
    n: args.n,
    v: args.v,
    customPeriodsPerYear: args.periods_per_year,
  });
  if (!parsed.ok) return toolError(parsed.error);

  let result: CheckResult;
  try {
    result = runBacktestCheck(parsed.input);
  } catch (e) {
    if (e instanceof CheckInputError) return toolError(e.message);
    return toolError("Unexpected error while calculating.");
  }

  const { shareUrl } = await buildShareLinks(publicBaseUrl(requestUrl), env, result);
  const link = shareUrl ?? `${SITE_URL}/`;
  const benchmarkAnnualized = result.benchmarkSR * Math.sqrt(result.periodsPerYear);
  return {
    content: [
      {
        type: "text",
        text: summaryText(result, benchmarkAnnualized, link, shareUrl ? "Verifiable result and details" : "More at"),
      },
    ],
    structuredContent: { ...result, benchmarkSRAnnualized: benchmarkAnnualized, shareUrl },
  };
}

function callDsrFromStats(args: Record<string, unknown>) {
  const num = (k: string, required: boolean): number | undefined | string => {
    const v = args[k];
    if (v === undefined || v === null) return required ? `"${k}" is required.` : undefined;
    return typeof v === "number" ? v : `"${k}" must be a number.`;
  };
  const sharpe = num("sharpe", true);
  const t = num("t", true);
  const n = num("n", true);
  const skew = num("skew", false);
  const kurtosis = num("kurtosis", false);
  const v = num("v", false);
  const ppy = num("periods_per_year", false);
  for (const x of [sharpe, t, n, skew, kurtosis, v, ppy]) if (typeof x === "string") return toolError(x);

  if (typeof args.sharpe_is_annual !== "boolean") return toolError('"sharpe_is_annual" must be true or false.');
  if (typeof args.frequency !== "string" || !FREQUENCIES.includes(args.frequency)) {
    return toolError(`"frequency" must be one of: ${FREQUENCIES.join(", ")}.`);
  }

  let result: StatsCheckResult;
  try {
    result = runStatsCheck({
      sharpe: sharpe as number,
      sharpeIsAnnual: args.sharpe_is_annual,
      frequency: args.frequency as DataFrequency,
      customPeriodsPerYear: ppy as number | undefined,
      T: t as number,
      nTrials: n as number,
      skew: skew as number | undefined,
      kurtosis: kurtosis as number | undefined,
      varianceOfTrialSharpes: v as number | undefined,
    });
  } catch (e) {
    if (e instanceof CheckInputError) return toolError(e.message);
    return toolError("Unexpected error while calculating.");
  }

  return {
    content: [{ type: "text", text: summaryText(result, result.benchmarkSRAnnualized, `${SITE_URL}/calculator`, "Try other numbers in the calculator") }],
    structuredContent: { ...result },
  };
}

// ---- JSON-RPC --------------------------------------------------------------

type Id = string | number | null;
interface RpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: Id, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...MCP_CORS_HEADERS,
    ...extra,
  };
}

export const MCP_CORS_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

async function handleMessage(msg: RpcMessage, env: Env, requestUrl: string): Promise<unknown | null> {
  const isRequest = typeof msg.method === "string" && msg.id !== undefined && msg.id !== null;
  const isNotification = typeof msg.method === "string" && (msg.id === undefined || msg.id === null);
  if (isNotification) return null; // e.g. notifications/initialized — nothing to answer
  if (!isRequest) {
    if (msg.result !== undefined || msg.error !== undefined) return null; // a client's response to us: ignore
    return rpcError(null, -32600, "Invalid Request");
  }

  const id = msg.id as Id;
  const params = asRecord(msg.params);

  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "dsr-web", title: MCP_TITLE, version: MCP_VERSION, description: MCP_DESCRIPTION },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = params.name;
      const args = asRecord(params.arguments);
      if (name === "check_backtest") return rpcResult(id, await callCheckBacktest(args, env, requestUrl));
      if (name === "dsr_from_stats") return rpcResult(id, callDsrFromStats(args));
      return rpcError(id, -32602, `Unknown tool: ${typeof name === "string" ? name.slice(0, 60) : "(missing name)"}`);
    }
    default:
      return rpcError(id, -32601, `Method not found: ${String(msg.method).slice(0, 60)}`);
  }
}

export function handleMcpNotPost(method: string): Response {
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  // This server is stateless: no server-to-client stream (GET) and no sessions to end (DELETE).
  return new Response(JSON.stringify(rpcError(null, -32000, "Method not allowed. Send JSON-RPC messages with POST.")), {
    status: 405,
    headers: jsonHeaders({ Allow: "POST, OPTIONS" }),
  });
}

export async function handleMcp(
  request: Request,
  env: Env,
  options: { limiter?: RateLimiter; now?: number } = {},
): Promise<Response> {
  if (request.method !== "POST") return handleMcpNotPost(request.method);

  const text = await readBodyLimited(request, MAX_BODY_BYTES);
  if (text === null) {
    return new Response(JSON.stringify(rpcError(null, -32600, `Request body is larger than ${MAX_BODY_BYTES} bytes.`)), {
      status: 413,
      headers: jsonHeaders(),
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), { status: 400, headers: jsonHeaders() });
  }

  const messages: unknown[] = Array.isArray(body) ? body : [body];
  if (messages.length === 0 || messages.length > 20) {
    return new Response(JSON.stringify(rpcError(null, -32600, "Invalid Request")), { status: 400, headers: jsonHeaders() });
  }

  // Rate limit only the calls that do work (same per-IP budget as /api/check).
  const doesWork = messages.some((m) => asRecord(m).method === "tools/call");
  if (doesWork) {
    const limiter = options.limiter ?? defaultLimiter;
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const wait = limiter.check(ip, options.now ?? Date.now());
    if (wait > 0) {
      return new Response(JSON.stringify(rpcError(null, -32000, `Too many requests. Try again in ${wait} seconds.`)), {
        status: 429,
        headers: jsonHeaders({ "Retry-After": String(wait) }),
      });
    }
  }

  const responses: unknown[] = [];
  for (const m of messages) {
    const r = await handleMessage(asRecord(m) as RpcMessage, env, request.url);
    if (r !== null) responses.push(r);
  }

  if (responses.length === 0) return new Response(null, { status: 202, headers: MCP_CORS_HEADERS });
  return new Response(JSON.stringify(Array.isArray(body) ? responses : responses[0]), { status: 200, headers: jsonHeaders() });
}
