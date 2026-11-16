# WEATHER CHEDDAR

**METAR-FIRST AVIATION CONSOLE**
*Actionable Intelligence as a Service for Making That Kalshi Cheese*

A client-side weather dashboard for the 24 Kalshi climate-contract stations. It has two views:

- **3D globe** (default): a Three.js globe with coastlines and US state borders. Each station is an orb on a temperature column, with temperature-colored particles orbiting it (spin speed follows the wind). USGS earthquakes show as pulsing rings, and stations with NWS alerts get a red hazard ring. Camera moves and data changes animate with GSAP.
- **Retro board**: the original ASCII / split-flap station board, plus raw METARs, hazards, and recent quakes.

Toggle with the **RETRO BOARD / 3D GLOBE** button or the **R** key. **H** resets the globe. The view you pick is remembered.

## Stations (Kalshi climate contracts)

| ICAO | City | WFO / CLI | | ICAO | City | WFO / CLI |
|---|---|---|---|---|---|---|
| KATL | Atlanta | FFC / CLIATL | | KMSY | New Orleans | LIX / CLIMSY |
| **KAUS** | Austin (TX) | EWX / CLIAUS | | KNYC | NYC Central Park | OKX / CLINYC |
| KBOS | Boston | BOX / CLIBOS | | KEWR | Newark | OKX / CLIEWR |
| KMDW | Chicago Midway | LOT / CLIMDW | | KOKC | Oklahoma City | OUN / CLIOKC |
| **KDFW** | Dallas/Fort Worth (TX) | FWD / CLIDFW | | KPHL | Philadelphia | PHI / CLIPHL |
| KDEN | Denver | BOU / CLIDEN | | KPHX | Phoenix | PSR / CLIPHX |
| **KHOU** | Houston Hobby (TX) | HGX / CLIHOU | | **KSAT** | San Antonio (TX) | EWX / CLISAT |
| KLAS | Las Vegas | VEF / CLILAS | | KSAN | San Diego | SGX / CLISAN |
| KLAX | Los Angeles | LOX / CLILAX | | KSFO | San Francisco | MTR / CLISFO |
| KSDF | Louisville | LMK / CLISDF | | KSEA | Seattle | SEW / CLISEA |
| KMIA | Miami | MFL / CLIMIA | | KTTN | Trenton | PHI / CLITTN |
| KMSP | Minneapolis | MPX / CLIMSP | | KDCA | Washington National | LWX / CLIDCA |

Each card carries a **KALSHI SETTLEMENT · CLIxxx** badge, with the full settlement note in its tooltip and in the detail panel. The four Texas stations (KAUS, KDFW, KHOU, KSAT) get orange cards, labels, and retro rows (★). Filter bar: All · Texas · East · Central · Mountain · West · Alerts. The filter applies to the cards, the retro board, and the globe (filtered-out stations are dimmed).

Station metadata lives in `src/stations.js`. The WFO and `CLI` + 3-letter product IDs follow standard NWS naming, but **confirm each contract's settlement source in its rules on Kalshi** before trading.

## Also in this repo

| Path | What |
|---|---|
| [`data/`](data/README.md) | `stations.json` (single source for the 24 stations) and `fetchers.js`: dependency-free METAR / NWS / USGS wrappers for Node and browsers |
| [`agent/`](agent/README.md) | `kalshi-bins.mjs`: CLI that prices daily-high bins for KSAT/KAUS/KDFW/KHOU (or any station) and computes spreads against your prices. Run `npm run agent:fixtures` to try it offline |
| [`docs/local-first-stack.md`](docs/local-first-stack.md) | Notes on Ollama + vLLM (`vllm-metal`) + LangGraph for an air-gapped weather/Kalshi pipeline on an M4 Mac |

## What each station shows

| Field | Meaning |
|---|---|
| Temp | Latest METAR temperature, °F. Uses tenths precision from the remarks T-group when present. |
| H / L | NWS forecast high (today; after NWS drops the "Today" period, the next day, labelled in the tooltip) and the next overnight low |
| spread | Forecast high minus low |
| T–Td | Temperature minus dewpoint (fog and low-ceiling risk) |
| Δ | Observed minus the NWS hourly forecast for the current hour |
| Today hi · obs so far / gap | Highest METAR temp of the **climate day** (midnight–midnight local *standard* time, as in the CLI report; during DST this is 01:00–01:00 clock time) vs today's forecast high |
| 24h chart | Past 24h of METAR (solid gold) and the next 24h of NWS hourly forecast (dashed) |
| Flight cat | VFR / MVFR / IFR / LIFR, computed from ceiling and visibility |

> **Trading note:** Kalshi temperature markets settle on the NWS Daily Climate Report (CLI), not on METAR maxima. Treat "obs so far" as a leading indicator, not the settlement value.

## Data modes

### Fixture mode (default, makes no network requests)

`src/fixtures.js` holds hard-coded sample conditions for all 24 stations: forecast hi/lo, wind, sky, visibility, weather, pressure, NWS alerts, and 21 USGS M2.5+ events. On every refresh it generates responses in the **raw shape of each real API**:

- `aviationweather.gov/api/data/metar` JSON rows, including a matching `rawOb` string
- `api.weather.gov` hourly and 12h forecast `periods`, plus an alerts FeatureCollection
- USGS `2.5_day.geojson`

These go through the same parsers as live data. Times are generated relative to "now", so the 24h series always looks current. Each refresh tick moves the noise seed, so values drift like a real feed, and every other tick adds a new (simulated) quake. The footer shows **◆ FIXTURE DATA · simulated feed**.

The page auto-refreshes every 5 minutes. Add `?tick=10` to the URL to simulate a refresh every 10 seconds (minimum 5).

### Live mode (opt-in: `?live=1`)

- METAR: `https://aviationweather.gov/api/data/metar?ids=…&format=json&hours=24` (one request gives the current obs and 24h history)
- NWS: `api.weather.gov/points/{lat},{lon}` (cached in localStorage), then `forecastHourly` and `forecast`; alerts from `/alerts/active?area=…`, matched to each station's zones
- USGS: `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`

Each request is tried directly first, then through `corsproxy.io`, then `api.allorigins.win`. You can supply your own proxy with `?proxy=https://my-proxy/?url=` or the `VITE_CORS_PROXY` build variable (`{url}` placeholder supported). The live adapters were written against the documented response formats but **have not yet been exercised against the real endpoints**. Check them in a browser with `?live=1` before relying on them.

Other URL parameters: `?mode=retro` opens the board directly; `?debug` exposes `window.__wc`.

## Run / build

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs dist/
npm run preview
```

Everything is bundled, including fonts (via @fontsource) and map geometry (world-atlas / us-atlas), so the default build makes no third-party requests. `base: './'` keeps asset paths relative.

## Deploy

- **GitHub Pages:** `.github/workflows/pages.yml` builds and deploys on every push to `main`. In repo **Settings → Pages**, set **Source: GitHub Actions**.
- **Vercel:** import the repo. It detects Vite automatically (build `npm run build`, output `dist`).
- **Any static host:** upload `dist/`.
- **Cloudflare at `www.cryptothaler.com/weathercheddar`:** serves the original app under the new address. See the next section.

## Cloudflare: www.cryptothaler.com/weathercheddar

`www.cryptothaler.com/weathercheddar/` serves the **original Weather Cheddar app**, the one already live at `/weather-cheddar/`, under the new hyphen-free address. It's the same page at a new URL. The 3D dashboard in this repo stays on GitHub Pages.

The original app runs in the existing Worker **`weather-cheddar-path-proxy`**, which only answers `/weather-cheddar/…` and writes that prefix into its `<base href>`, links and JSON. So this repo deploys a small alias Worker named **`weathercheddar`**:

1. A request to `/weathercheddar/…` is forwarded through a **service binding** (`LEGACY`) to `weather-cheddar-path-proxy` as `/weather-cheddar/…`. A service binding is a direct Worker-to-Worker call, so the old Worker's route doesn't matter here.
2. In text responses (HTML, JS, JSON, CSS, SVG) and in `Location` / `Set-Cookie` headers, `/weather-cheddar` is rewritten to `/weathercheddar` as a whole path segment only, so file names like `weather-cheddar-header.png` stay intact. Visitors stay on the new address.
3. The old Worker, its code and its `/weather-cheddar` route are untouched. The old URL keeps working.

| File | Must stay as-is |
|---|---|
| `wrangler.jsonc` | `name: "weathercheddar"`, `main: "cloudflare/worker.js"`, routes `www.cryptothaler.com/weathercheddar*` + `cryptothaler.com/weathercheddar*` (zone `cryptothaler.com`), `services: [{ binding: "LEGACY", service: "weather-cheddar-path-proxy" }]`. **Don't add a `/weather-cheddar*` route.** |
| `cloudflare/worker.js` | the alias and rewrite logic |

Tested locally with `wrangler dev`, running this Worker next to the original Worker's deployed code (read from the account) and mock static files:

| Request | Result |
|---|---|
| `/weathercheddar` | 301 → `/weathercheddar/` |
| `/weathercheddar/`, `/guide/`, `/temperature-prediction-agent/`, `/K_Guage` | 200, original pages, `<base href="/weathercheddar/">` |
| `/weathercheddar/static/…` (css, js, png, json) | 200. Absolute `/weather-cheddar/…` URLs inside are rewritten |
| Browser session (dashboard → guide link) | every request stayed under `/weathercheddar/`; none went to `/weather-cheddar/` |

### Deploy

1. **DNS:** in **cryptothaler.com → DNS → Records**, `www` (and the apex `cryptothaler.com`, if you want that alias too) must be **Proxied** (orange cloud).
2. **Option A, dashboard:** **Workers & Pages → Create → Import a repository → GitHub → `CryptoThaler/weathercheddar`**. Name it `weathercheddar`, leave the build command empty, set the deploy command to `npx wrangler deploy`, root directory `/`, production branch `main`. Then click **Deploy**.
   **Option B, local:** run `npm ci && npx wrangler login && npm run deploy:cf`.
3. In **Worker `weathercheddar` → Settings → Bindings**, confirm the service binding `LEGACY → weather-cheddar-path-proxy`. Under **Domains & Routes**, confirm the two `…/weathercheddar*` routes.

### Verify

```bash
curl -sI https://www.cryptothaler.com/weathercheddar | grep -iE '^(HTTP|location)'
curl -s https://www.cryptothaler.com/weathercheddar/ | grep -o '<base href="[^"]*"'
curl -s -o /dev/null -w '%{http_code}\n' https://www.cryptothaler.com/weather-cheddar/
```

Expected:
- **First command:** `301`, with `location: …/weathercheddar/`.
- **Second command:** `<base href="/weathercheddar/"`.
- **Third command:** the old URL still returns `200`.

Then open https://www.cryptothaler.com/weathercheddar/ in a browser and click **Guide**. The address bar should stay on `/weathercheddar/…`.

### Optional: retire the hyphenated URL

Once the new address works, you can send old links to it with a **Single Redirect** ([docs](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/)). In the dashboard, go to **cryptothaler.com → Rules → Redirect Rules → Create rule** and set:

- **Match:** Wildcard pattern. **Request URL:** `http*://*cryptothaler.com/weather-cheddar*`
- **Target URL:** `https://www.cryptothaler.com/weathercheddar${3}`
- **Status code:** 301
- **Preserve query string:** on

Keep the `weather-cheddar-path-proxy` Worker deployed, because the alias still calls it through the service binding, which redirect rules don't apply to. Test with the Rules simulator, or with `curl -I`, that `/weather-cheddar/guide/` redirects to `/weathercheddar/guide/` and that `/weathercheddar/` still returns `200`.

### Rollback

Delete the `weathercheddar` routes (or the Worker). `/weather-cheddar/` is unaffected either way.

GitHub Pages deployment (`.github/workflows/pages.yml`) keeps running on every push to `main`, independently of Cloudflare.

## Layout

```
index.html          shell + branding
src/main.js         state, refresh loop, mode toggle (GSAP crossfade)
src/stations.js     24 Kalshi stations: coords, tz, WFO, CLI id, Texas flag, region filters
src/data.js         fetch/CORS fallback, METAR/NWS/USGS parsers, fixture switch
src/fixtures.js     sample data emitted in raw API shapes
src/derive.js       trader metrics (Δ, hi gap, spread, series) + temperature colour ramp
src/globe.js        Three.js scene (lazy-loaded; render loop pauses in retro mode or hidden tab)
src/retro.js        ASCII split-flap board
src/ui.js           station cards, detail panel, SVG charts
```

If WebGL isn't available, the page falls back to the retro board.
