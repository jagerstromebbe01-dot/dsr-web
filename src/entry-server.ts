import { createElement } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";

export { ROUTES, headTagsFor } from "./routes";

/** Renders the whole app for a path to an HTML string (build-time prerender). */
export function render(path: string): string {
  return renderToString(createElement(App, { initialPath: path }));
}
