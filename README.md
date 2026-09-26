# Backtest Overfitting Calculator

A free, static, client-side calculator for the Deflated Sharpe Ratio (DSR) —
Bailey & López de Prado (2014). All calculations run in the browser; nothing
entered into the calculator is ever sent to a server.

## What's here

- `src/lib/dsr.ts` — the core math (PSR, the deflation benchmark SR*₀, DSR).
- `src/lib/normal.ts` — dependency-free standard normal CDF / inverse CDF.
- `src/lib/evaporationCurve.ts` — shared chart geometry (used by both the
  on-page SVG chart and the shareable PNG, so they can't drift apart).
- `src/lib/shareImage.ts` — canvas-based PNG export.
- `src/pages/CalculatorPage.tsx` — the calculator UI.
- `src/pages/ArticlePage.tsx` — "Why your backtest is probably lying".
- `src/lib/dsr.test.ts` — Vitest unit tests, including a cross-check against
  an external Python reference implementation (see below).
- `tools/` — one-off Python scripts: `gen_reference_values*.py` generate the
  test fixtures in `tools/reference_values*.json`, `gen_og_image.py`
  generates `public/og-image.png` (requires Pillow and Windows fonts — only
  needs rerunning if the share image's design changes). None of these are
  part of the shipped site.

## Running locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Running tests

```bash
npm test
```

## Building

```bash
npm run build
```

Output goes to `dist/`. It's a fully static site — no server, no database,
no build-time secrets.

## Regenerating the reference test values (optional)

Only needed if `src/lib/dsr.ts` changes and you want to re-verify it against
the reference implementations. Requires Python 3 with `scipy`/`numpy`.

`gen_reference_values.py` cross-checks this project's "V unknown" mode
against an **external** Deflated Sharpe Ratio implementation — it does not
ship or vendor one. Point it at your own local copy (a file defining
`deflated_sharpe_ratio(observed_sr, n_trials, n_obs, skew=0.0, kurt=3.0)`
per Bailey & López de Prado (2014)) via an environment variable or a
command-line argument:

```bash
cd tools

# V-unknown mode: point at your own local reference implementation
REFERENCE_DSR_IMPL=/path/to/deflated_sharpe_ratio.py python gen_reference_values.py
# or: python gen_reference_values.py /path/to/deflated_sharpe_ratio.py

# V-measured mode: independent scipy implementation, no external file needed
python gen_reference_values_v_measured.py
```

Both scripts only ever write inside `tools/` in this repo.

## Deploying for free

### Option A: Cloudflare Pages

1. Push this repo to GitHub (or GitLab).
2. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
3. Select this repository.
4. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Click **Save and Deploy**. Cloudflare gives you a `*.pages.dev` URL
   immediately; a custom domain can be attached afterwards under
   **Custom domains**.

### Option B: GitHub Pages

1. Push this repo to GitHub.
2. In `vite.config.ts`, set `base: '/<your-repo-name>/'` (only needed if
   deploying to `https://<user>.github.io/<repo-name>/` rather than a custom
   domain or a root `*.github.io` repo).
3. Add a GitHub Actions workflow (`.github/workflows/deploy.yml`) that runs
   `npm ci && npm run build` and publishes `dist/` with
   `actions/deploy-pages`, or simply build locally and push the `dist/`
   folder to a `gh-pages` branch using a tool like `gh-pages` (`npm i -D
   gh-pages`, then `npx gh-pages -d dist`).
4. Enable **Pages** in the repo's Settings, pointing at the `gh-pages`
   branch (or the Actions workflow, if used).

## Adding an email field later (not built yet)

A placeholder exists in the UI copy only — no form, no field, no
third-party script. To add a real one later without a custom backend, the
simplest options are:

- **Cloudflare Pages Functions** (a `functions/subscribe.ts` file) writing
  to a KV namespace or forwarding to an email service's API.
- A third-party form endpoint (e.g. Buttondown, ConvertKit, Formspree) — add
  the `<form action="...">` pointing at their endpoint; no backend code
  needed on this side, but review their privacy terms first since that
  reintroduces a third party the current "your numbers never leave your
  browser" claim doesn't apply to (the email field only, not the
  calculator itself).

## Notes on the math

- All Sharpe ratios inside the formulas are **per period**, never
  annualized. The UI converts for you based on the frequency you pick.
- Kurtosis is in the **non-excess** convention (normal distribution = 3).
  The UI has a toggle if your kurtosis is in the excess (normal = 0)
  convention instead.
- **V unknown mode** (default) approximates V — the variance of the tried
  strategies' per-period Sharpe ratios — as `1 / (T - 1)`, the variance of
  the Sharpe estimator itself evaluated at SR = 0. This implicitly treats
  "the typical tried strategy" as pure noise; it's a standard, conservative
  fallback, not a precise measurement.
- **V measured mode** lets you supply an actual variance, either directly or
  computed from a pasted list of the Sharpe ratios of everything you tried.
