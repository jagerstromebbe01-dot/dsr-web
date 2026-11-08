import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { normalizePath } from "./routes";

const container = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App initialPath={normalizePath(window.location.pathname)} />
  </StrictMode>
);

// Prerendered pages already contain the HTML: attach to it. In `npm run dev`
// the root is empty, so render from scratch.
if (container.children.length > 0) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
