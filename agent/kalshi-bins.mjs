#!/usr/bin/env node
// Weather Cheddar · Kalshi temp-bin agent
// Pulls METAR (aviationweather.gov) + NWS hourly/daily forecasts for the Texas Kalshi
// stations (default KSAT, KAUS, KDFW, KHOU) and prices daily-HIGH temperature bins.
//
// Model (deliberately simple, uncalibrated — a starting point, not trading advice):
//   H = max(ObsHi, X),  X ~ Normal(mu, sigma)
//   ObsHi  = highest METAR temp so far in the climate day (LST), incl. 6-h max groups
//   mu     = remaining NWS hourly peak (blended with NWS "Today" high while the peak is ahead)
//            + 0.5 * current anomaly (latest obs − NWS hourly forecast for this hour)
//   sigma  = 1.0 + 0.2 °F per hour until the forecast peak (clamped 0.8–4.0); 0.3 once the
//            climate day has no forecast hours left
//   P(settles at k °F) = P(k−0.5 ≤ H < k+0.5)   (CLI reports whole °F)
//
// Usage:
//   node agent/kalshi-bins.mjs                         # live, Texas 4
//   node agent/kalshi-bins.mjs --fixtures              # offline sample data, no network
//   node agent/kalshi-bins.mjs --stations KNYC,KMDW --bin-width 2 --bins 6
//   node agent/kalshi-bins.mjs --prices agent/prices.example.json   # spreads vs market
//   node agent/kalshi-bins.mjs --json > out.json
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchBundle, climateDay, climateDayBounds, observedHighSoFar, DEFAULT_USER_AGENT } from '../data/fetchers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const H = 3600e3;

const { values: args } = parseArgs({
  options: {
    stations: { type: 'string', default: 'KSAT,KAUS,KDFW,KHOU' },
    fixtures: { type: 'boolean', default: false },
    'bin-width': { type: 'string', default: '2' },
    bins: { type: 'string', default: '6' },
    anchor: { type: 'string' },
    prices: { type: 'string' },
    'user-agent': { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}

const ALL = JSON.parse(readFileSync(join(ROOT, 'data/stations.json'), 'utf8')).stations;
const wanted = args.stations.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const stations = wanted.map((id) => ALL.find((s) => s.icao === id) || die(`Unknown station ${id}. Known: ${ALL.map((s) => s.icao).join(' ')}`));
const binWidth = Math.max(1, parseInt(args['bin-width'], 10) || 2);
const nBins = Math.max(2, parseInt(args.bins, 10) || 6);
const prices = args.prices ? JSON.parse(readFileSync(args.prices, 'utf8')) : null;

function die(msg) {
  console.error(msg);
  process.exit(2);
}

// ------------------------------------------------------------ math
// Abramowitz–Stegun 7.1.26 erf approximation (|err| < 1.5e-7) — plenty for bin pricing.
function erf(x) {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ------------------------------------------------------------ model
function model(entry, now) {
  const { station: s, obs, nws } = entry;
  const tz = s.tz;
  const [, dayEnd] = climateDayBounds(now, tz);
  const today = climateDay(now, tz);
  const latest = obs.at(-1) || null;
  const obsHi = observedHighSoFar(obs, tz, now);
  const hourly = nws?.hourly || [];
  const daily = nws?.daily || [];

  const nowP = hourly.find((p) => p.start <= now && now < p.end);
  const remaining = hourly.filter((p) => p.end > now && p.start < dayEnd && p.tempF != null);
  const peak = remaining.reduce((m, p) => (!m || p.tempF > m.tempF ? p : m), null);
  const todayP = daily.find((p) => p.isDaytime && climateDay(p.start + 6 * H, tz) === today);

  const fresh = latest && now - latest.time < 90 * 60e3;
  const anomaly = fresh && latest.tempF != null && nowP?.tempF != null ? latest.tempF - nowP.tempF : 0;

  let mu, sigma, hoursToPeak = 0;
  if (peak) {
    hoursToPeak = Math.max(0, (peak.start - now) / H);
    const base = todayP?.tempF != null && hoursToPeak > 0 ? (peak.tempF + todayP.tempF) / 2 : peak.tempF;
    mu = base + 0.5 * anomaly;
    sigma = clamp(1.0 + 0.2 * hoursToPeak, 0.8, 4.0);
  } else {
    mu = obsHi ?? latest?.tempF ?? null;
    sigma = 0.3;
  }
  if (mu == null) return { error: 'no observations or forecast' };

  const floor = obsHi ?? -Infinity;
  // P(H < h) where H = max(floor, X)
  const cdf = (h) => (h <= floor ? 0 : Phi((h - mu) / sigma));
  const pInt = (lo, hi) => cdf(hi + 0.5) - cdf(lo - 0.5); // integer °F range [lo, hi]
  const median = (() => {
    let lo = mu - 6 * sigma - 1, hi = mu + 6 * sigma + 1;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      cdf(m) < 0.5 ? (lo = m) : (hi = m);
    }
    return Math.max(floor, (lo + hi) / 2);
  })();

  // Bins: nBins interior bins of binWidth °F around the median, plus two tails.
  const anchor = args.anchor != null ? parseInt(args.anchor, 10) : null;
  let first = Math.round(median) - Math.floor((nBins * binWidth) / 2);
  if (anchor != null) first -= (((first - anchor) % binWidth) + binWidth) % binWidth;
  const bins = [];
  bins.push({ label: `<=${first - 1}`, p: cdf(first - 0.5) });
  for (let i = 0; i < nBins; i++) {
    const lo = first + i * binWidth, hi = lo + binWidth - 1;
    bins.push({ label: binWidth === 1 ? `${lo}` : `${lo}-${hi}`, p: pInt(lo, hi) });
  }
  const last = first + nBins * binWidth;
  bins.push({ label: `>=${last}`, p: 1 - cdf(last - 0.5) });

  const px = prices?.[s.icao] || {};
  for (const b of bins) {
    b.fair = Math.round(b.p * 1000) / 10; // cents, 0.1 precision
    if (px[b.label] != null) {
      b.price = px[b.label];
      b.spread = Math.round((b.fair - b.price) * 10) / 10; // + = model says YES is cheap
    }
  }

  return {
    icao: s.icao,
    name: s.name,
    cli: s.cli,
    climateDay: today,
    latest: latest && { time: new Date(latest.time).toISOString(), tempF: round1(latest.tempF), raw: latest.raw },
    obsHiSoFar: round1(obsHi),
    nwsTodayHigh: todayP?.tempF ?? null,
    nwsRemainingPeak: peak ? { tempF: peak.tempF, at: new Date(peak.start).toISOString() } : null,
    obsVsFcstSpread: obsHi != null && todayP?.tempF != null ? round1(obsHi - todayP.tempF) : null,
    anomalyNow: round1(anomaly),
    mu: round1(mu),
    sigma: round1(sigma),
    hoursToPeak: round1(hoursToPeak),
    medianHigh: round1(median),
    bins,
    alerts: entry.alerts.map((a) => a.event),
  };
}
const round1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

// ------------------------------------------------------------ offline fixtures
async function fixtureFetch() {
  const fx = await import('../src/fixtures.js'); // same generators the dashboard uses
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  const near = (lat, lon) => ALL.find((s) => Math.abs(s.lat - lat) < 1e-3 && Math.abs(s.lon - lon) < 1e-3);
  return async (url) => {
    const u = new URL(url);
    if (u.hostname === 'aviationweather.gov') {
      const ids = (u.searchParams.get('ids') || '').split(',');
      return json(fx.metarRows().filter((r) => ids.includes(r.icaoId)));
    }
    if (u.hostname === 'api.weather.gov') {
      let m;
      if ((m = /^\/points\/([-\d.]+),([-\d.]+)$/.exec(u.pathname))) {
        const s = near(+m[1], +m[2]);
        const f = fx.nwsFor(s.icao);
        return json({ properties: { forecast: `https://api.weather.gov/fixture/${s.icao}/forecast`, forecastHourly: `https://api.weather.gov/fixture/${s.icao}/hourly`, forecastZone: f.point.forecastZone, timeZone: f.point.timeZone, gridId: f.point.gridId } });
      }
      if ((m = /^\/fixture\/(K\w{3})\/(forecast|hourly)$/.exec(u.pathname))) {
        const f = fx.nwsFor(m[1]);
        return json(m[2] === 'hourly' ? f.hourly : f.daily);
      }
      if (u.pathname === '/alerts/active') return json(fx.alertsFC());
    }
    if (u.hostname === 'earthquake.usgs.gov') return json(fx.quakeFC());
    return new Response('not in fixtures', { status: 404 });
  };
}

// ------------------------------------------------------------ main
const now = Date.now();
const opts = { userAgent: args['user-agent'] || DEFAULT_USER_AGENT };
if (args.fixtures) opts.fetch = await fixtureFetch();
const bundle = await fetchBundle(stations, opts);
const results = stations.map((s) => model(bundle.stations[s.icao], now));
const out = { generatedAt: new Date(now).toISOString(), source: args.fixtures ? 'fixtures' : 'live', results, errors: bundle.errors };

if (args.json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`WEATHER CHEDDAR · Kalshi high-temp bins · ${out.generatedAt} · source=${out.source}`);
  console.log('Model is a simple heuristic (see header). Settlement = NWS CLI report, not METAR.\n');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.icao ?? '?'}: ${r.error}\n`);
      continue;
    }
    console.log(`${r.icao} ${r.name} · ${r.cli} · climate day ${r.climateDay}${r.alerts.length ? ' · ⚠ ' + r.alerts.join(', ') : ''}`);
    console.log(`  now ${fmt(r.latest?.tempF)}  obs-hi ${fmt(r.obsHiSoFar)}  NWS today-hi ${fmt(r.nwsTodayHigh)}  remaining peak ${fmt(r.nwsRemainingPeak?.tempF)}  obs−fcst ${sgn(r.obsVsFcstSpread)}`);
    console.log(`  model μ ${fmt(r.mu)} σ ${r.sigma}  (anomaly ${sgn(r.anomalyNow)}, ${r.hoursToPeak}h to peak)  median high ${fmt(r.medianHigh)}`);
    console.log('  ' + 'bin'.padEnd(8) + 'P'.padStart(7) + 'fair¢'.padStart(8) + (prices ? 'mkt¢'.padStart(7) + 'spread'.padStart(8) : ''));
    for (const b of r.bins) {
      const bar = '█'.repeat(Math.round(b.p * 30));
      console.log('  ' + b.label.padEnd(8) + `${(b.p * 100).toFixed(1)}%`.padStart(7) + b.fair.toFixed(1).padStart(8) + (prices ? (b.price ?? '').toString().padStart(7) + (b.spread != null ? sgn(b.spread) : '').padStart(8) : '') + '  ' + bar);
    }
    console.log('');
  }
  if (bundle.errors.length) console.log('Errors:', bundle.errors);
}
if (results.every((r) => r.error)) process.exit(1);

function fmt(v) {
  return v == null ? '--' : `${v}°F`;
}
function sgn(v) {
  return v == null ? '--' : `${v > 0 ? '+' : ''}${v}`;
}
