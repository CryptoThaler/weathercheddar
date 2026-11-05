// Weather Cheddar data layer: fetch + normalize wrappers for
//   - AviationWeather.gov METAR   https://aviationweather.gov/api/data/metar
//   - NWS API (api.weather.gov)   points -> forecast / forecastHourly, active alerts
//   - USGS earthquake GeoJSON     https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/
//
// Pure ESM, no dependencies, no UI. Runs in Node >= 18 (global fetch) and modern browsers.
// Station metadata lives in ./stations.json (load it with fs in Node, or import/fetch it in a bundler).
//
// Every fetcher accepts an optional `opts` object:
//   { fetch, userAgent, timeout = 15000, retries = 2, signal }
// `fetch` lets you inject a custom implementation (tests, proxies, offline fixtures).

export const ENDPOINTS = {
  metar: 'https://aviationweather.gov/api/data/metar',
  nws: 'https://api.weather.gov',
  usgsFeed: (feed = '2.5_day') => `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`,
};

// NWS asks API clients to identify themselves with a User-Agent. Browsers don't allow setting it,
// so it is only sent outside the browser. Override with opts.userAgent (add your contact info).
export const DEFAULT_USER_AGENT = 'weathercheddar-data/1.0 (+https://github.com/CryptoThaler/weathercheddar)';
const IN_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

const H = 3600e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with timeout + retry on network errors, 429 and 5xx (honours Retry-After). */
export async function getJSON(url, opts = {}) {
  const { fetch: f = globalThis.fetch, userAgent = DEFAULT_USER_AGENT, timeout = 15000, retries = 2, headers = {}, signal } = opts;
  const hdrs = { Accept: 'application/geo+json, application/json;q=0.9', ...headers };
  if (!IN_BROWSER && userAgent) hdrs['User-Agent'] = userAgent;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new Error(`timeout after ${timeout}ms`)), timeout);
    signal?.addEventListener('abort', () => ctl.abort(signal.reason), { once: true });
    try {
      const res = await f(url, { headers: hdrs, signal: ctl.signal });
      if (res.status === 204) return null; // aviationweather: no data
      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      lastErr.status = res.status;
      if (res.status !== 429 && res.status < 500) throw lastErr; // don't retry 4xx
      const ra = Number(res.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** attempt);
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      if (signal?.aborted) throw e;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- helpers
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? null : +v);
export const cToF = (c) => (c == null ? null : (c * 9) / 5 + 32);
export const fToC = (f) => (f == null ? null : ((f - 32) * 5) / 9);

/** Local calendar day (YYYY-MM-DD) in `tz`. */
export function localDay(t, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

const stdOffsetCache = new Map();
function utcOffsetMin(t, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(t)
      .map((x) => [x.type, x.value])
  );
  return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60e3) * 60e3) / 60e3);
}
/** UTC offset (minutes) of local STANDARD time for `tz` (e.g. -360 for America/Chicago). */
export function standardOffsetMin(tz) {
  if (!stdOffsetCache.has(tz)) {
    const y = new Date().getUTCFullYear();
    stdOffsetCache.set(tz, Math.min(utcOffsetMin(Date.UTC(y, 0, 15), tz), utcOffsetMin(Date.UTC(y, 6, 15), tz)));
  }
  return stdOffsetCache.get(tz);
}
/**
 * Climate day (YYYY-MM-DD) as used by the NWS Daily Climate Report (CLI): midnight–midnight
 * local standard time all year, so during DST it runs 01:00–01:00 clock time.
 */
export const climateDay = (t, tz) => new Date(t + standardOffsetMin(tz) * 60e3).toISOString().slice(0, 10);
/** [start, end) epoch ms of the climate day containing `t`. */
export function climateDayBounds(t, tz) {
  const off = standardOffsetMin(tz) * 60e3;
  const start = Math.floor((t + off) / 864e5) * 864e5 - off;
  return [start, start + 864e5];
}

export function flightCategory(clouds, visSm) {
  const cig = (clouds || []).filter((c) => /BKN|OVC|OVX|VV/.test(c.cover) && c.base != null).reduce((m, c) => Math.min(m, c.base), Infinity);
  const v = visSm ?? 10;
  if (cig < 500 || v < 1) return 'LIFR';
  if (cig < 1000 || v < 3) return 'IFR';
  if (cig <= 3000 || v <= 5) return 'MVFR';
  return 'VFR';
}

// ---------------------------------------------------------------- METAR
const sgnT = (s, ddd) => (s === '1' ? -1 : 1) * (+ddd / 10);

/**
 * Parse temperature remarks from a raw METAR:
 *  T-group  TsTTTsDDD   -> temp/dew in tenths °C (hourly)
 *  1-group  1sTTT       -> 6-hour maximum °C (00/06/12/18Z obs)
 *  2-group  2sTTT       -> 6-hour minimum °C
 *  4-group  4sTTTsTTT   -> 24-hour max/min °C (local-midnight obs)
 * Only tokens after "RMK" are considered.
 */
export function parseTempRemarks(raw = '') {
  const rmk = raw.split(' RMK ')[1];
  const out = { tempC: null, dewC: null, max6hC: null, min6hC: null, max24hC: null, min24hC: null };
  if (!rmk) return out;
  for (const tok of rmk.trim().split(/\s+/)) {
    let m;
    if ((m = /^T([01])(\d{3})([01])(\d{3})$/.exec(tok))) (out.tempC = sgnT(m[1], m[2])), (out.dewC = sgnT(m[3], m[4]));
    else if ((m = /^T([01])(\d{3})$/.exec(tok))) out.tempC = sgnT(m[1], m[2]);
    else if ((m = /^1([01])(\d{3})$/.exec(tok))) out.max6hC = sgnT(m[1], m[2]);
    else if ((m = /^2([01])(\d{3})$/.exec(tok))) out.min6hC = sgnT(m[1], m[2]);
    else if ((m = /^4([01])(\d{3})([01])(\d{3})$/.exec(tok))) (out.max24hC = sgnT(m[1], m[2])), (out.min24hC = sgnT(m[3], m[4]));
  }
  return out;
}

/** Normalize one aviationweather.gov METAR JSON row. */
export function normalizeMetar(row) {
  const rm = parseTempRemarks(row.rawOb);
  const vis = row.visib == null ? null : parseFloat(String(row.visib));
  const clouds = Array.isArray(row.clouds) ? row.clouds.map((c) => ({ cover: c.cover, base: c.base ?? null })) : [];
  const altim = num(row.altim);
  const tempC = rm.tempC ?? num(row.temp);
  const dewC = rm.dewC ?? num(row.dewp);
  return {
    icao: row.icaoId,
    time: row.obsTime ? row.obsTime * 1000 : Date.parse(row.reportTime),
    tempC,
    dewC,
    tempF: cToF(tempC),
    dewF: cToF(dewC),
    max6hF: cToF(rm.max6hC),
    min6hF: cToF(rm.min6hC),
    max24hF: cToF(rm.max24hC),
    windDir: row.wdir ?? null,
    windKt: num(row.wspd),
    gustKt: num(row.wgst),
    visSm: Number.isNaN(vis) ? null : vis,
    altimHpa: altim == null ? null : altim > 100 ? altim : altim / 0.02953,
    clouds,
    wx: row.wxString || '',
    flightCat: row.fltCat || flightCategory(clouds, Number.isNaN(vis) ? null : vis),
    raw: row.rawOb || '',
  };
}

/**
 * Fetch METARs for `icaos` over the past `hours` (default 24).
 * Returns { [icao]: Observation[] } sorted oldest -> newest, de-duplicated by obs time.
 */
export async function fetchMetar(icaos, { hours = 24, ...opts } = {}) {
  const ids = [...new Set(icaos)].join(',');
  const rows = (await getJSON(`${ENDPOINTS.metar}?ids=${ids}&format=json&hours=${hours}`, opts)) || [];
  const by = {};
  for (const r of rows) {
    const o = normalizeMetar(r);
    if (o.icao && o.time) (by[o.icao] ||= new Map()).set(o.time, o);
  }
  return Object.fromEntries(Object.entries(by).map(([k, m]) => [k, [...m.values()].sort((a, b) => a.time - b.time)]));
}

// ---------------------------------------------------------------- NWS
/** /points/{lat},{lon} -> forecast URLs, zones, time zone, office. Cache the result: it rarely changes. */
export async function fetchNwsPoint(lat, lon, opts = {}) {
  const p = (await getJSON(`${ENDPOINTS.nws}/points/${lat},${lon}`, opts)).properties;
  return {
    forecastUrl: p.forecast,
    hourlyUrl: p.forecastHourly,
    zones: [p.forecastZone, p.county, p.fireWeatherZone].filter(Boolean),
    tz: p.timeZone,
    office: p.gridId,
    gridX: p.gridX,
    gridY: p.gridY,
  };
}

export function normalizePeriods(json) {
  return (json?.properties?.periods || []).map((p) => {
    const raw = typeof p.temperature === 'object' && p.temperature ? p.temperature.value : p.temperature;
    const unit = p.temperatureUnit || (typeof p.temperature === 'object' ? (p.temperature.unitCode || '').includes('degC') ? 'C' : 'F' : 'F');
    return {
      start: Date.parse(p.startTime),
      end: Date.parse(p.endTime),
      name: p.name || '',
      isDaytime: !!p.isDaytime,
      tempF: unit === 'C' ? cToF(num(raw)) : num(raw),
      pop: p.probabilityOfPrecipitation?.value ?? null,
      wind: `${p.windDirection || ''} ${p.windSpeed || ''}`.trim(),
      short: p.shortForecast || '',
    };
  });
}

/** Hourly forecast periods (~156 h). Pass a cached point to skip the /points call. */
export async function fetchNwsHourly(station, { point, ...opts } = {}) {
  const pt = point || (await fetchNwsPoint(station.lat, station.lon, opts));
  return { point: pt, periods: normalizePeriods(await getJSON(pt.hourlyUrl, opts)) };
}

/** 12-hour day/night forecast periods (7 days). */
export async function fetchNwsForecast(station, { point, ...opts } = {}) {
  const pt = point || (await fetchNwsPoint(station.lat, station.lon, opts));
  return { point: pt, periods: normalizePeriods(await getJSON(pt.forecastUrl, opts)) };
}

/** Active alerts for state/area codes (e.g. ['TX','DC']). Match to a station via point.zones. */
export async function fetchNwsAlerts(areas, opts = {}) {
  const j = await getJSON(`${ENDPOINTS.nws}/alerts/active?area=${[...new Set(areas)].join(',')}`, opts);
  return (j?.features || []).map((f) => ({
    id: f.id,
    event: f.properties.event,
    severity: f.properties.severity,
    headline: f.properties.headline,
    onset: f.properties.onset,
    ends: f.properties.ends || f.properties.expires,
    zones: f.properties.affectedZones || [],
  }));
}
export const alertsForPoint = (alerts, point) => alerts.filter((a) => a.zones.some((z) => point.zones.includes(z)));

// ---------------------------------------------------------------- USGS
/** USGS earthquake summary feed, e.g. '2.5_day', '4.5_week', 'all_hour'. Newest first. */
export async function fetchQuakes(feed = '2.5_day', opts = {}) {
  const j = await getJSON(ENDPOINTS.usgsFeed(feed), opts);
  return (j?.features || [])
    .map((f) => ({
      id: f.id,
      mag: num(f.properties.mag),
      place: f.properties.place,
      time: f.properties.time,
      url: f.properties.url,
      tsunami: !!f.properties.tsunami,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      depthKm: f.geometry.coordinates[2],
    }))
    .filter((q) => q.mag != null)
    .sort((a, b) => b.time - a.time);
}

// ---------------------------------------------------------------- convenience
/**
 * Everything for a set of stations in parallel. Failures are reported per source/station
 * instead of throwing, so one flaky NWS grid doesn't sink the batch.
 * `pointCache` (Map icao -> point) avoids repeated /points calls across runs.
 */
export async function fetchBundle(stations, { hours = 24, alerts = true, pointCache = new Map(), ...opts } = {}) {
  const errors = [];
  const metarP = fetchMetar(stations.map((s) => s.icao), { hours, ...opts }).catch((e) => (errors.push({ source: 'metar', error: e.message }), {}));
  const alertsP = alerts
    ? fetchNwsAlerts(stations.flatMap((s) => s.nws_alert_area || [s.state]), opts).catch((e) => (errors.push({ source: 'alerts', error: e.message }), []))
    : Promise.resolve([]);
  const nws = await Promise.all(
    stations.map(async (s) => {
      try {
        const point = pointCache.get(s.icao) || (await fetchNwsPoint(s.lat, s.lon, opts));
        pointCache.set(s.icao, point);
        const [h, d] = await Promise.allSettled([fetchNwsHourly(s, { point, ...opts }), fetchNwsForecast(s, { point, ...opts })]);
        if (h.status === 'rejected') errors.push({ source: 'nws-hourly', icao: s.icao, error: h.reason.message });
        if (d.status === 'rejected') errors.push({ source: 'nws-forecast', icao: s.icao, error: d.reason.message });
        return [s.icao, { point, hourly: h.value?.periods || [], daily: d.value?.periods || [] }];
      } catch (e) {
        errors.push({ source: 'nws-point', icao: s.icao, error: e.message });
        return [s.icao, null];
      }
    })
  );
  const [metar, alertList] = await Promise.all([metarP, alertsP]);
  const nwsBy = Object.fromEntries(nws);
  return {
    fetchedAt: Date.now(),
    stations: Object.fromEntries(
      stations.map((s) => [
        s.icao,
        { station: s, obs: metar[s.icao] || [], nws: nwsBy[s.icao], alerts: nwsBy[s.icao] ? alertsForPoint(alertList, nwsBy[s.icao].point) : [] },
      ])
    ),
    errors,
  };
}

/**
 * Highest observed °F so far in the current climate day, using hourly/special temps and any
 * 6-hour max groups whose whole window falls inside the climate day.
 */
export function observedHighSoFar(obs, tz, now = Date.now()) {
  const [start] = climateDayBounds(now, tz);
  let hi = null;
  for (const o of obs) {
    if (o.time < start || o.time > now) continue;
    if (o.tempF != null) hi = Math.max(hi ?? -Infinity, o.tempF);
    if (o.max6hF != null && o.time - 6 * H >= start) hi = Math.max(hi ?? -Infinity, o.max6hF);
  }
  return hi;
}
