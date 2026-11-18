import { useEffect, useState } from "react";
import { CheckPage } from "./pages/CheckPage";
import { CalculatorPage } from "./pages/CalculatorPage";
import { ArticlePage } from "./pages/ArticlePage";
import { ApiPage } from "./pages/ApiPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LEGACY_HASHES, NOT_FOUND_META, ROUTES, SITE_URL, findRoute, normalizePath } from "./routes";
import "./App.css";

function PageFor({ path }: { path: string }) {
  switch (path) {
    case "/":
      return <CheckPage />;
    case "/calculator":
      return <CalculatorPage />;
    case "/article":
      return <ArticlePage />;
    case "/api":
      return <ApiPage />;
    case "/privacy":
      return <PrivacyPage />;
    case "/terms":
      return <TermsPage />;
    default:
      return <NotFoundPage />;
  }
}

/** `initialPath` is the path the page was (pre)rendered for. */
function App({ initialPath }: { initialPath: string }) {
  const [path, setPath] = useState(initialPath);

  // Old #hash links -> real addresses; back/forward; in-app link clicks.
  useEffect(() => {
    const legacy = LEGACY_HASHES[window.location.hash];
    if (legacy) {
      window.location.replace(legacy);
      return;
    }

    const onPopState = () => setPath(normalizePath(window.location.pathname));

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      const next = normalizePath(href);
      if (!findRoute(next)) return; // not one of our pages (e.g. /api): let the browser load it
      e.preventDefault();
      window.history.pushState(null, "", next);
      setPath(next);
      window.scrollTo(0, 0);
    };

    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Keep title / description in sync when navigating without a page load.
  useEffect(() => {
    const route = findRoute(path);
    document.title = route ? route.title : NOT_FOUND_META.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", route ? route.description : NOT_FOUND_META.description);
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", `${SITE_URL}${path === "/" ? "/" : path}`);
  }, [path]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="brand">
          Backtest Overfitting Calculator
        </a>
        <nav>
          {ROUTES.filter((r) => r.inNav).map((r) => (
            <a key={r.path} href={r.path} className={path === r.path ? "active" : ""}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="app-main">
        <PageFor path={path} />
      </main>

      <footer className="app-footer">
        <p>
          Your numbers stay in your browser. All calculations run locally in JavaScript — nothing you enter is sent
          to a server or stored, with one exception: if you click “Copy share link” or “Copy README badge”, your
          returns are sent once so the server can sign the result (not stored, not logged). The public API and the MCP
          server work the same way. No cookies. We only count anonymous page views (Cloudflare Web Analytics).{" "}
          <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
