import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publicBaseUrl } from "../functions/_lib/shareApi";
import siteConfig from "../site.config.json";
import { SITE_URL, headTagsFor } from "./routes";

const root = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|mjs|html)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("site address is configured in ONE place (site.config.json)", () => {
  it("is a valid https URL", () => {
    expect(siteConfig.siteUrl).toMatch(/^https:\/\/[a-z0-9.-]+$/i);
    expect(SITE_URL).toBe(siteConfig.siteUrl.replace(/\/+$/, ""));
  });

  it("no source file hardcodes the domain", () => {
    const host = new URL(siteConfig.siteUrl).host;
    const offenders = ["src", "functions", "scripts"]
      .flatMap((d) => sourceFiles(path.join(root, d)))
      .concat([path.join(root, "index.html")])
      .filter((f) => readFileSync(f, "utf8").includes(host));
    expect(offenders).toEqual([]);
  });

  it("canonical and og tags use it", () => {
    const head = headTagsFor("/calculator");
    expect(head).toContain(`href="${SITE_URL}/calculator"`);
    expect(head).toContain(`content="${SITE_URL}/og-image.png"`);
  });

  it("share links use it, except on localhost", () => {
    expect(publicBaseUrl("https://anything.example/api/check")).toBe(SITE_URL);
    expect(publicBaseUrl("https://preview.dsr-web.pages.dev/r?x=1")).toBe(SITE_URL);
    expect(publicBaseUrl("http://localhost:8788/api/check")).toBe("http://localhost:8788");
  });
});
