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
- **Embedding at `cryptothaler.com/weather-cheddar`:** host `dist/` under that path, or iframe the Pages/Vercel URL.

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
