# data/: station registry and fetch wrappers

A plain data layer with no dependencies and no UI. It runs in Node 18+ and modern browsers.

## `stations.json`

This file is the single source of truth for the 24 Kalshi daily-temperature stations. The dashboard (`src/stations.js`) and the agent both read it.

| field | example | notes |
|---|---|---|
| `icao` | `KHOU` | METAR station id |
| `name`, `state` | `Houston Hobby`, `TX` | |
| `lat`, `lon` | `29.6454, -95.2789` | ASOS site, used for NWS `/points` |
| `tz` | `America/Chicago` | IANA time zone |
| `wfo` | `HGX` | NWS office that issues the Daily Climate Report |
| `cli` | `CLIHOU` | CLI product id (`CLI` + 3-letter id) |
| `region` | `central` | east / central / mountain / west |
| `texas` | `true` | KAUS, KDFW, KHOU, KSAT |
| `nws_alert_area` | `["TX"]` | `area=` codes for `/alerts/active` (KDCA uses VA + DC) |

The WFO and CLI ids follow standard NWS naming. **Check each contract's settlement source in its Kalshi rulebook.**

## `fetchers.js`

```js
import { readFileSync } from 'node:fs';
import { fetchBundle, fetchMetar, fetchNwsHourly, observedHighSoFar } from './data/fetchers.js';

const { stations } = JSON.parse(readFileSync('data/stations.json', 'utf8'));
const tx = stations.filter((s) => s.texas);
const bundle = await fetchBundle(tx, { userAgent: 'my-app/1.0 (you@example.com)' });
// bundle.stations.KAUS => { station, obs: Observation[], nws: { point, hourly, daily }, alerts }
```

| function | source | returns |
|---|---|---|
| `fetchMetar(icaos, {hours})` | aviationweather.gov `/api/data/metar` | `{ICAO: Observation[]}`, oldest first. Includes tenths-°C T-group temps and 6 h / 24 h max/min remark groups |
| `fetchNwsPoint(lat, lon)` | api.weather.gov `/points` | forecast URLs, zones, tz, office (cache it) |
| `fetchNwsHourly(station)` / `fetchNwsForecast(station)` | forecastHourly / forecast | normalized periods (`tempF`, `start`, `end`, `isDaytime`, `pop`, …) |
| `fetchNwsAlerts(areas)` + `alertsForPoint` | `/alerts/active?area=` | alerts matched to a station's zones |
| `fetchQuakes(feed)` | USGS summary GeoJSON | quakes, newest first |
| `fetchBundle(stations)` | all of the above | per-station bundle, with per-source `errors` (never throws for one bad grid) |
| `climateDay`, `climateDayBounds` | | CLI climate day: midnight–midnight **local standard time** |
| `observedHighSoFar(obs, tz)` | | max of hourly temps and of 6-h max groups that fall wholly inside the climate day |

Every function takes `opts`: `{ fetch, userAgent, timeout, retries, signal }`. Injecting `fetch` lets you add proxies, caching or offline fixtures (the agent's `--fixtures` mode does this). Requests retry on network errors, 429 and 5xx, and honor `Retry-After`. Outside the browser a `User-Agent` is sent, since the NWS API asks clients to identify themselves. Put your own contact details in it.

Live endpoints have not been called from the build environment (its network blocks them). The parsers are tested against API-shaped fixtures and hand-written METAR remark samples.
