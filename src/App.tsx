import { useEffect, useState } from "react";
import { CalculatorPage } from "./pages/CalculatorPage";
import { ArticlePage } from "./pages/ArticlePage";
import "./App.css";

type Route = "calculator" | "article";

function routeFromHash(): Route {
  return window.location.hash === "#article" ? "article" : "calculator";
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="#calculator" className="brand">
          Backtest Overfitting Calculator
        </a>
        <nav>
          <a href="#calculator" className={route === "calculator" ? "active" : ""}>
            Calculator
          </a>
          <a href="#article" className={route === "article" ? "active" : ""}>
            Why your backtest is probably lying
          </a>
        </nav>
      </header>

      <main className="app-main">{route === "article" ? <ArticlePage /> : <CalculatorPage />}</main>

      <footer className="app-footer">
        <p>
          Your numbers never leave your browser. All calculations run locally in JavaScript — nothing you enter is
          sent to a server or stored. No cookies. We only count anonymous page views (Cloudflare Web Analytics).
        </p>
      </footer>
    </div>
  );
}

export default App;
