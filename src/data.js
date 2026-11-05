// Data layer: METAR (aviationweather.gov), NWS (api.weather.gov), USGS earthquakes.
// DEFAULT = FIXTURE MODE: no network requests; fixtures emit each API's raw shape and
// run through the same parsers below. Live mode is opt-in with ?live=1 (direct fetch,
// then public CORS-proxy fallback).
import * as fx from './fixtures.js';

import { STATIONS } from './stations.js';
export { STATIONS };

const IDS = STATIONS.map((s) => s.id).join(',');
export const METAR_URL = `https://aviationweather.gov/api/data/metar?ids=${IDS}&format=json`;
export const QUAKE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const NWS = 'https://api.weather.gov';

// ---------- fetch with CORS-proxy fallback ----------
const qs = new URLSearchParams(location.search);
export const LIVE = qs.get('live') === '1';
export const advanceFixtures = fx.advance;
const customProxy = qs.get('proxy') || import.meta.env.VITE_CORS_PROXY;
const wrap = (tpl) => (u) => (tpl.includes('{url}') ? tpl.replace('{url}', encodeURIComponent(u)) : tpl + encodeURIComponent(u));
const PROXIES = [
  ...(customProxy ? [wrap(customProxy)] : []),
  wrap('https://corsproxy.io/?url='),
  wrap('https://api.allorigins.win/raw?url='),
];
const route = new Map(); // host -> -1 (direct) | proxy index that last worked

async function getJSON(url, ms, headers) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text(); // aviationweather returns 204/empty when no data
    return txt ? JSON.parse(txt) : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJSON(url, { headers, timeout = 15000 } = {}) {
  const host = new URL(url).host;
  const order = [-1, ...PROXIES.map((_, i) => i)];
  if (route.has(host)) order.sort((a, b) => (a === route.get(host) ? -1 : b === route.get(host) ? 1 : 0));
  let err;
  for (const i of order) {
    try {
      const data = await getJSON(i < 0 ? url : PROXIES[i](url), timeout, i < 0 ? headers : undefined);
      route.set(host, i);
      return data;
    } catch (e) {
      err = e;
    }
  }
  throw err;
}
export const routeFor = (host) => !LIVE ? 'fixture' : (route.get(host) ?? -1) < 0 ? 'direct' : 'proxy';

// ---------- helpers ----------
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? null : +v);
export const cToF = (c) => (c == null ? null : (c * 9) / 5 + 32);

// Tenths-precision temp/dew from the METAR remarks T-group (e.g. T02560178).
function tGroup(raw) {
  const m = / T([01])(\d{3})([01])(\d{3})/.exec(raw || '');
  if (!m) return null;
  return { t: (m[1] === '1' ? -1 : 1) * (+m[2] / 10), d: (m[3] === '1' ? -1 : 1) * (+m[4] / 10) };
}

function visNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

export function flightCat(clouds, vis) {
  const cig = (clouds || [])
    .filter((c) => /BKN|OVC|OVX|VV/.test(c.cover) && c.base != null)
    .reduce((m, c) => Math.min(m, c.base), Infinity);
  const v = vis ?? 10;
  if (cig < 500 || v < 1) return 'LIFR';
  if (cig < 1000 || v < 3) return 'IFR';
  if (cig <= 3000 || v <= 5) return 'MVFR';
  return 'VFR';
}

function normObs(o) {
  const tg = tGroup(o.rawOb);
  const vis = visNum(o.visib);
  const clouds = Array.isArray(o.clouds) ? o.clouds : [];
  const altim = num(o.altim);
  return {
    id: o.icaoId,
    t: o.obsTime ? o.obsTime * 1000 : Date.parse(o.reportTime),
    tempC: tg ? tg.t : num(o.temp),
    dewC: tg ? tg.d : num(o.dewp),
    wdir: o.wdir ?? null,
    wspd: num(o.wspd),
    wgst: num(o.wgst),
    vis,
    visRaw: o.visib ?? null,
    // API reports hPa; tolerate inHg just in case
    altHpa: altim == null ? null : altim > 100 ? altim : altim / 0.02953,
    clouds,
    wx: o.wxString || '',
    raw: o.rawOb || '',
    cat: o.fltCat || flightCat(clouds, vis),
  };
}

// ---------- METAR: one request returns current + 24h history ----------
export async function loadMetar() {
  const rows = (LIVE ? await fetchJSON(`${METAR_URL}&hours=24`) : fx.metarRows()) || [];
  const by = {};
  for (const r of rows) {
    const o = normObs(r);
    if (!o.id || !o.t) continue;
    (by[o.id] ||= new Map()).set(o.t, o); // de-dupe identical obs times
  }
  const out = {};
  for (const [id, m] of Object.entries(by)) out[id] = [...m.values()].sort((a, b) => a.t - b.t);
  return out;
}

// ---------- NWS ----------
const NWS_HEADERS = { Accept: 'application/geo+json' };

async function nwsPoint(st) {
  const key = `wc_pt_v1_${st.id}`;
  try {
    const c = JSON.parse(localStorage.getItem(key));
    if (c && c.forecastHourly) return c;
  } catch {}
  const p = (await fetchJSON(`${NWS}/points/${st.lat},${st.lon}`, { headers: NWS_HEADERS })).properties;
  const v = {
    forecast: p.forecast,
    forecastHourly: p.forecastHourly,
    zones: [p.forecastZone, p.county, p.fireWeatherZone].filter(Boolean),
    tz: p.timeZone,
    office: p.gridId,
  };
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
  return v;
}

const periodsOf = (j) =>
  (j?.properties?.periods || []).map((p) => ({
    start: Date.parse(p.startTime),
    end: Date.parse(p.endTime),
    f: p.temperatureUnit === 'C' ? cToF(num(p.temperature?.value ?? p.temperature)) : num(p.temperature?.value ?? p.temperature),
    name: p.name,
    day: p.isDaytime,
    short: p.shortForecast,
    wind: `${p.windDirection || ''} ${p.windSpeed || ''}`.trim(),
    pop: p.probabilityOfPrecipitation?.value ?? null,
  }));

export async function loadNws(st) {
  if (!LIVE) {
    const f = fx.nwsFor(st.id);
    // fixture stands in for "today's high as issued earlier today"
    return { tz: f.point.timeZone, zones: [f.point.forecastZone], office: f.point.gridId, hourly: periodsOf(f.hourly), daily: periodsOf(f.daily), issuedHi: fx.FIX[st.id].hi };
  }
  const pt = await nwsPoint(st);
  const [h, d] = await Promise.allSettled([
    fetchJSON(pt.forecastHourly, { headers: NWS_HEADERS }),
    fetchJSON(pt.forecast, { headers: NWS_HEADERS }),
  ]);
  if (h.status === 'rejected' && d.status === 'rejected') throw h.reason;
  const daily = d.status === 'fulfilled' ? periodsOf(d.value) : null;
  // NWS drops the "Today" period after ~6 PM local; remember the last-issued high for the local day.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: pt.tz }).format(Date.now());
  const key = `wc_hi_${st.id}_${day}`;
  const todayP = daily?.find((p) => p.day && new Intl.DateTimeFormat('en-CA', { timeZone: pt.tz }).format(p.start) === day);
  try {
    if (todayP?.f != null) localStorage.setItem(key, String(todayP.f));
  } catch {}
  let issuedHi = null;
  try {
    issuedHi = num(localStorage.getItem(key));
  } catch {}
  return {
    issuedHi,
    tz: pt.tz,
    zones: pt.zones,
    office: pt.office,
    hourly: h.status === 'fulfilled' ? periodsOf(h.value) : null,
    daily,
  };
}

export async function loadAlerts() {
  const areas = [...new Set([...STATIONS.map((s) => s.st), 'DC'])].join(','); // KDCA sits on the VA/DC line
  const j = LIVE ? await fetchJSON(`${NWS}/alerts/active?area=${areas}`, { headers: NWS_HEADERS }) : fx.alertsFC();
  return (j?.features || []).map((f) => ({
    id: f.id,
    event: f.properties.event,
    severity: f.properties.severity,
    headline: f.properties.headline,
    ends: f.properties.ends || f.properties.expires,
    zones: f.properties.affectedZones || [],
  }));
}

// ---------- USGS ----------
export async function loadQuakes() {
  const j = LIVE ? await fetchJSON(QUAKE_URL) : fx.quakeFC();
  return (j?.features || [])
    .map((f) => ({
      id: f.id,
      mag: num(f.properties.mag),
      place: f.properties.place,
      t: f.properties.time,
      url: f.properties.url,
      tsunami: !!f.properties.tsunami,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      depth: f.geometry.coordinates[2],
    }))
    .filter((q) => q.mag != null)
    .sort((a, b) => b.t - a.t);
}
