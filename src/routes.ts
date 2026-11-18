/**
 * Single source of truth for the site's pages: paths, titles, descriptions.
 * Used by the app (navigation, document.title), by the build-time
 * prerenderer (<head> tags, sitemap.xml) and nothing else.
 */

import siteConfig from "../site.config.json";

/**
 * THE site address. It is defined once, in site.config.json (repo root).
 * Moving to your own domain = change that one value and redeploy: canonical
 * links, Open Graph tags, sitemap.xml, robots.txt, API examples and the
 * share links / badges all follow it.
 */
export const SITE_URL: string = siteConfig.siteUrl.replace(/\/+$/, "");
/** Where people can reach the maintainer (shown on the privacy page). */
export const CONTACT_URL: string = siteConfig.contactUrl;
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface RouteMeta {
  path: string;
  /** Short label for the nav bar. */
  label: string;
  /** Show in the top navigation (the privacy page is linked from the footer instead). */
  inNav: boolean;
  title: string;
  description: string;
}

export const ROUTES: RouteMeta[] = [
  {
    path: "/",
    label: "Backtest check",
    inNav: true,
    title: "Is My Backtest Overfit? Free Deflated Sharpe Ratio Check",
    description:
      "Paste your backtest returns and the number of strategies you tried. Get a green / yellow / red answer on whether your Sharpe ratio is probably real or just luck, using the Deflated Sharpe Ratio. Runs in your browser.",
  },
  {
    path: "/calculator",
    label: "Calculator",
    inNav: true,
    title: "Deflated Sharpe Ratio Calculator — Backtest Overfitting",
    description:
      "Free Deflated Sharpe Ratio (DSR) calculator. Find out how much of your backtest's Sharpe ratio survives correcting for how many strategies you tried. Runs entirely in your browser.",
  },
  {
    path: "/article",
    label: "Why your backtest is probably lying",
    inNav: true,
    title: "Why Your Backtest Is Probably Lying — Backtest Overfitting Explained",
    description:
      "Why the best backtest out of many is usually luck, how the Deflated Sharpe Ratio corrects for it, and a worked example with real numbers.",
  },
  {
    path: "/api",
    label: "API",
    inNav: true,
    title: "Backtest Check API — Free Deflated Sharpe Ratio JSON API",
    description:
      "Free JSON API that checks whether a backtest's Sharpe ratio is probably real or luck, using the Deflated Sharpe Ratio. curl and Python examples. No API key.",
  },
  {
    path: "/privacy",
    label: "Privacy",
    inNav: false,
    title: "Privacy Policy — Backtest Overfitting Calculator",
    description:
      "What happens to your data: calculations run in your browser; share links, the API and the MCP server process data in memory and never store or log it. No cookies, no accounts.",
  },
];

export const NOT_FOUND_META = {
  title: "Page not found — Backtest Overfitting Calculator",
  description: "This page does not exist.",
};

export function normalizePath(pathname: string): string {
  let p = pathname.split("?")[0].split("#")[0];
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function findRoute(path: string): RouteMeta | undefined {
  return ROUTES.find((r) => r.path === path);
}

/** Old hash links (#calculator, #article, #check) -> new paths. */
export const LEGACY_HASHES: Record<string, string> = {
  "#check": "/",
  "#calculator": "/calculator",
  "#article": "/article",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The per-page <head> tags (title, description, canonical, Open Graph, Twitter). */
export function headTagsFor(path: string): string {
  const route = findRoute(path);
  const title = route ? route.title : NOT_FOUND_META.title;
  const description = route ? route.description : NOT_FOUND_META.description;
  const lines = [`<title>${esc(title)}</title>`, `<meta name="description" content="${esc(description)}" />`];
  if (route) {
    const url = SITE_URL + (route.path === "/" ? "/" : route.path);
    lines.push(
      `<link rel="canonical" href="${esc(url)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${esc(url)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:image" content="${OG_IMAGE}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    );
  } else {
    lines.push(`<meta name="robots" content="noindex" />`);
  }
  return lines.join("\n    ");
}
