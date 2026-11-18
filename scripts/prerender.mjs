// Build-time prerender: turns each page into a static HTML file so that
// crawlers that do not run JavaScript (most AI search bots) still see the text.
//
// Runs after `vite build` (client -> dist/) and `vite build --ssr` (server
// bundle -> dist-ssr/). For every route it renders the React app to a string,
// drops it into dist/index.html (the client build's template, which already
// has the hashed JS/CSS tags) and writes it to its own file:
//   /           -> dist/index.html
//   /calculator -> dist/calculator.html   (Cloudflare Pages serves it at /calculator)
//   unknown     -> dist/404.html          (Pages answers unknown URLs with this + HTTP 404)
// It also writes dist/sitemap.xml and dist/robots.txt; the domain comes from site.config.json.

import { readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const ssrDir = path.join(root, "dist-ssr");

const { render, ROUTES, headTagsFor } = await import(pathToFileURL(path.join(ssrDir, "entry-server.js")).href);

const template = await readFile(path.join(dist, "index.html"), "utf8");
if (!template.includes("<!--head-->") || !template.includes("<!--app-->")) {
  throw new Error("dist/index.html is missing the <!--head--> / <!--app--> placeholders");
}

function page(routePath) {
  // Function replacers: the HTML contains "$" characters that String.replace would otherwise interpret.
  return template
    .replace("<!--head-->", () => headTagsFor(routePath))
    .replace("<!--app-->", () => render(routePath));
}

for (const route of ROUTES) {
  const file = route.path === "/" ? "index.html" : `${route.path.slice(1)}.html`;
  await writeFile(path.join(dist, file), page(route.path));
  console.log(`prerendered ${route.path} -> dist/${file}`);
}

await writeFile(path.join(dist, "404.html"), page("/__not-found__"));
console.log("prerendered 404 -> dist/404.html");

const site = JSON.parse(await readFile(path.join(root, "site.config.json"), "utf8")).siteUrl.replace(/\/+$/, "");
const urls = ROUTES.map((r) => `  <url><loc>${site}${r.path === "/" ? "/" : r.path}</loc></url>`).join("\n");
await writeFile(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log("wrote dist/sitemap.xml");

const crawlers = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended"];
await writeFile(
  path.join(dist, "robots.txt"),
  [
    "# Everyone is welcome, including AI search crawlers.",
    "User-agent: *",
    "Allow: /",
    "",
    ...crawlers.flatMap((c) => [`User-agent: ${c}`, "Allow: /", ""]),
    `Sitemap: ${site}/sitemap.xml`,
    "",
  ].join("\n"),
);
console.log("wrote dist/robots.txt");

await rm(ssrDir, { recursive: true, force: true });
