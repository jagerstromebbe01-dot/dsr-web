import { describe, expect, it } from "vitest";
import { LEGACY_HASHES, ROUTES, findRoute, headTagsFor, normalizePath } from "./routes";

describe("routes", () => {
  it("normalizePath strips trailing slash, query and hash", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/calculator/")).toBe("/calculator");
    expect(normalizePath("/article?x=1#y")).toBe("/article");
  });

  it("legacy hashes map to real routes", () => {
    for (const target of Object.values(LEGACY_HASHES)) expect(findRoute(target)).toBeDefined();
  });

  it("every page has its own title, description and canonical", () => {
    const titles = new Set(ROUTES.map((r) => r.title));
    const descs = new Set(ROUTES.map((r) => r.description));
    expect(titles.size).toBe(ROUTES.length);
    expect(descs.size).toBe(ROUTES.length);
    for (const r of ROUTES) {
      const head = headTagsFor(r.path);
      expect(head).toContain(`<title>`);
      expect(head).toContain('name="description"');
      expect(head).toContain('rel="canonical"');
      expect(head).toContain('property="og:title"');
      expect(head).not.toContain("noindex");
    }
  });

  it("unknown paths are noindex and have no canonical", () => {
    const head = headTagsFor("/__nope__");
    expect(head).toContain("noindex");
    expect(head).not.toContain("canonical");
  });
});
