// Hard-coded fixture data, emitted in the *raw* shapes of each public API
// (aviationweather.gov METAR JSON, api.weather.gov periods/alerts, USGS GeoJSON)
// so the exact same parsers run in fixture and live mode.
// Times are generated relative to "now" so the 24h series always looks current;
// each refresh tick advances a seed so values drift like a live feed.

const H = 3600e3;

// Sample conditions for an early-November day. hi/lo in °F; td = temp–dewpoint spread °F;
// bias = how far obs run vs the forecast curve (°F) — gives the board realistic "gap" variety.
export const FIX = {
  KNYC: { name: 'New York/Central Park', tz: 'America/New_York', hi: 58, lo: 46, td: 12, bias: 0.8, wdir: 270, wspd: 10, wgst: 0, vis: 10, clouds: [['FEW', 5000]], wx: '', hpa: 1016.6, short: 'Mostly Sunny', pop: 5 },
  KJFK: { name: 'New York/JFK Intl', tz: 'America/New_York', hi: 57, lo: 47, td: 11, bias: 0.3, wdir: 260, wspd: 14, wgst: 22, vis: 10, clouds: [['SCT', 4500]], wx: '', hpa: 1016.3, short: 'Mostly Sunny', pop: 5 },
  KLAX: { name: 'Los Angeles Intl', tz: 'America/Los_Angeles', hi: 72, lo: 57, td: 9, bias: -1.6, wdir: 250, wspd: 9, wgst: 0, vis: 7, clouds: [['BKN', 1500]], wx: '', hpa: 1013.2, short: 'Patchy Fog then Sunny', pop: 0 },
  KSFO: { name: 'San Francisco Intl', tz: 'America/Los_Angeles', hi: 64, lo: 51, td: 10, bias: 0.2, wdir: 290, wspd: 16, wgst: 0, vis: 10, clouds: [['FEW', 2000]], wx: '', hpa: 1015.9, short: 'Sunny', pop: 0 },
  KORD: { name: "Chicago O'Hare Intl", tz: 'America/Chicago', hi: 49, lo: 38, td: 7, bias: -0.9, wdir: 310, wspd: 18, wgst: 29, vis: 10, clouds: [['OVC', 2500]], wx: '', hpa: 1009.8, short: 'Cloudy and Breezy', pop: 15, alert: ['Wind Advisory', 'Moderate', 'Wind Advisory until 7 PM CST — NW gusts to 45 mph'] },
  KDEN: { name: 'Denver Intl', tz: 'America/Denver', hi: 38, lo: 25, td: 2, bias: -1.2, wdir: 20, wspd: 8, wgst: 0, vis: 1.5, clouds: [['OVC', 800]], wx: '-SN BR', hpa: 1021.0, short: 'Light Snow', pop: 80, alert: ['Winter Weather Advisory', 'Moderate', 'Winter Weather Advisory until 11 PM MST — 2–5 in. of snow'] },
  KATL: { name: 'Atlanta Hartsfield-Jackson', tz: 'America/New_York', hi: 70, lo: 52, td: 14, bias: 1.1, wdir: 180, wspd: 6, wgst: 0, vis: 10, clouds: [['SCT', 6000]], wx: '', hpa: 1018.0, short: 'Partly Sunny', pop: 10 },
  KBOS: { name: 'Boston Logan Intl', tz: 'America/New_York', hi: 53, lo: 43, td: 13, bias: 0.5, wdir: 280, wspd: 12, wgst: 0, vis: 10, clouds: [['FEW', 4000], ['BKN', 25000]], wx: '', hpa: 1014.9, short: 'Mostly Sunny', pop: 5 },
  KMIA: { name: 'Miami Intl', tz: 'America/New_York', hi: 84, lo: 74, td: 7, bias: 0.4, wdir: 90, wspd: 12, wgst: 0, vis: 10, clouds: [['SCT', 2500]], wx: '', hpa: 1015.2, short: 'Scattered Showers', pop: 30, alert: ['Rip Current Statement', 'Moderate', 'High rip current risk through this evening'] },
  KDFW: { name: 'Dallas/Fort Worth Intl', tz: 'America/Chicago', hi: 76, lo: 58, td: 12, bias: 1.9, wdir: 170, wspd: 14, wgst: 21, vis: 10, clouds: [['BKN', 3500]], wx: '', hpa: 1011.4, short: 'Partly Sunny and Breezy', pop: 10 },
  KSAT: { name: 'San Antonio Intl', tz: 'America/Chicago', hi: 81, lo: 62, td: 10, bias: 1.3, wdir: 160, wspd: 11, wgst: 0, vis: 10, clouds: [['SCT', 3000]], wx: '', hpa: 1011.9, short: 'Mostly Cloudy', pop: 10 },
  KAUS: { name: 'Austin-Bergstrom Intl', tz: 'America/Chicago', hi: 80, lo: 59, td: 11, bias: -0.4, wdir: 170, wspd: 10, wgst: 0, vis: 10, clouds: [['BKN', 2800]], wx: '', hpa: 1012.1, short: 'Mostly Cloudy', pop: 15 },
};

// [mag, place, lat, lon, depth km, hours ago]
const QUAKES = [
  [5.8, '112 km SSE of Sand Point, Alaska', 54.37, -159.92, 28, 3.2],
  [4.6, '23 km W of Ovalle, Chile', -30.6, -71.43, 54, 5.9],
  [5.1, 'Kermadec Islands region', -29.7, -177.6, 35, 8.4],
  [3.2, '9 km NE of Ridgecrest, CA', 35.69, -117.6, 7, 1.1],
  [2.7, '6 km SW of Volcano, Hawaii', 19.39, -155.29, 2, 0.6],
  [4.9, '140 km E of Hachinohe, Japan', 40.52, 143.21, 31, 11.6],
  [2.9, '14 km N of Guánica, Puerto Rico', 18.1, -66.9, 12, 4.4],
  [3.6, '35 km SE of Mina, Nevada', 38.18, -117.82, 9, 13.2],
  [4.4, 'south of the Fiji Islands', -23.9, 179.8, 520, 15.1],
  [2.6, '18 km ESE of Anza, CA', 33.52, -116.49, 11, 16.8],
  [3.1, '41 km NW of Toyah, Texas', 31.62, -104.12, 6, 18.3],
  [5.3, 'Banda Sea', -6.88, 129.62, 140, 19.9],
  [2.8, '60 km N of Yakutat, Alaska', 60.08, -139.6, 10, 21.0],
  [4.2, '20 km SSW of Acapulco, Mexico', 16.68, -99.95, 22, 23.4],
  [3.4, '5 km NE of Pawnee, Oklahoma', 36.37, -96.76, 5, 26.1],
  [4.7, 'Tonga Islands', -18.9, -174.4, 60, 29.5],
  [2.5, '3 km NNW of The Geysers, CA', 38.8, -122.77, 2, 31.0],
  [4.3, 'Crete, Greece', 34.95, 25.3, 18, 34.2],
  [3.0, '12 km E of Ennis, Montana', 45.35, -111.57, 9, 38.0],
  [4.5, 'near the coast of Peru', -15.4, -75.2, 40, 41.7],
  [2.6, '27 km SE of Pāhala, Hawaii', 19.03, -155.38, 32, 44.9],
];

// ---------- tiny deterministic noise ----------
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  return ((Math.imul(h, 0x5bd1e995) >>> 0) % 1e6) / 1e6;
}
const noise = (k) => (hash(k) - 0.5) * 2;

let tick = 0;
export const advance = () => ++tick;

function localHour(t, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }).formatToParts(t).map((x) => [x.type, x.value]));
  return +p.hour + +p.minute / 60;
}
const weekday = (t, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(t);

// Diurnal curve: min ~03L, max ~15L.
const curve = (s, t) => (s.hi + s.lo) / 2 + ((s.hi - s.lo) / 2) * Math.cos((2 * Math.PI * (localHour(t, s.tz) - 15)) / 24);
const fToC = (f) => ((f - 32) * 5) / 9;

// ---------- METAR rows (aviationweather.gov /api/data/metar JSON shape) ----------
function metarRow(id, s, t, f, seed) {
  const c = Math.round(fToC(f) * 10) / 10;
  const d = Math.round(fToC(f - s.td) * 10) / 10;
  const wspd = Math.max(0, Math.round(s.wspd + noise(seed + 'w') * 3));
  const wgst = s.wgst ? Math.max(wspd + 6, Math.round(s.wgst + noise(seed + 'g') * 3)) : null;
  const wdir = (Math.round((s.wdir + noise(seed + 'd') * 20) / 10) * 10 + 360) % 360 || 360;
  const hpa = Math.round((s.hpa + noise(seed + 'p') * 0.8) * 10) / 10;
  const dt = new Date(t);
  const z = (n, w = 2) => String(n).padStart(w, '0');
  const tc = (v) => (v < 0 ? 'M' : '') + z(Math.abs(Math.round(v)));
  const tg = (v) => (v < 0 ? '1' : '0') + z(Math.round(Math.abs(v) * 10), 3);
  const sky = s.clouds.map(([cv, b]) => `${cv}${z(b / 100, 3)}`).join(' ');
  const visS = s.vis >= 10 ? '10SM' : `${String(s.vis).replace('1.5', '1 1/2')}SM`;
  const raw = [
    id,
    `${z(dt.getUTCDate())}${z(dt.getUTCHours())}${z(dt.getUTCMinutes())}Z`,
    `${z(wdir, 3)}${z(wspd)}${wgst ? 'G' + wgst : ''}KT`,
    visS,
    s.wx,
    sky,
    `${tc(c)}/${tc(d)}`,
    `A${Math.round(hpa * 0.02953 * 100)}`,
    `RMK AO2 SLP${z(Math.round(hpa * 10) % 1000, 3)} T${tg(c)}${tg(d)}`,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    icaoId: id,
    obsTime: Math.floor(t / 1000),
    reportTime: dt.toISOString(),
    temp: Math.round(c),
    dewp: Math.round(d),
    wdir,
    wspd,
    wgst,
    visib: s.vis >= 10 ? '10+' : s.vis,
    altim: hpa,
    clouds: s.clouds.map(([cover, base]) => ({ cover, base })),
    wxString: s.wx || null,
    rawOb: raw,
    name: s.name,
  };
}

export function metarRows(now = Date.now()) {
  const rows = [];
  const top = Math.floor(now / H) * H;
  for (const [id, s] of Object.entries(FIX)) {
    for (let k = 0; k <= 24; k++) {
      const t = top - k * H + 51 * 60e3 - (top + 51 * 60e3 > now ? H : 0);
      if (t < now - 24 * H) continue;
      rows.push(metarRow(id, s, t, curve(s, t) + s.bias + noise(`${id}:${t}`) * 0.9, `${id}:${t}`));
    }
    // a fresh "special" each refresh tick so the board visibly updates
    const tc = Math.floor(now / 300e3) * 300e3;
    rows.push(metarRow(id, s, tc, curve(s, tc) + s.bias + noise(`${id}:cur:${tick}`) * 1.2, `${id}:cur:${tick}`));
  }
  return rows.sort((a, b) => b.obsTime - a.obsTime); // API returns newest first
}

// ---------- NWS (api.weather.gov forecast + forecastHourly "periods") ----------
const dirName = (d) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];

export function nwsFor(id, now = Date.now()) {
  const s = FIX[id];
  const top = Math.floor(now / H) * H;
  const hourly = Array.from({ length: 48 }, (_, i) => {
    const t = top + i * H;
    const h = localHour(t, s.tz);
    return {
      startTime: new Date(t).toISOString(),
      endTime: new Date(t + H).toISOString(),
      isDaytime: h >= 6 && h < 18,
      temperature: Math.round(curve(s, t + 0.5 * H)),
      temperatureUnit: 'F',
      windSpeed: `${Math.round(s.wspd * 1.15)} mph`,
      windDirection: dirName(s.wdir),
      shortForecast: s.short,
      probabilityOfPrecipitation: { value: s.pop },
    };
  });
  // 12h day/night periods split at 06L / 18L, first one truncated to now (like NWS).
  const daily = [];
  let start = top, t = top + H;
  const end = top + 7 * 24 * H;
  for (; t <= end; t += H) {
    const h = Math.round(localHour(t, s.tz));
    if (h !== 6 && h !== 18) continue;
    const day = localHour(start + 1, s.tz) >= 6 && localHour(start + 1, s.tz) < 18;
    const n = daily.length;
    const drift = Math.round(noise(`${id}:day:${Math.floor(n / 2)}`) * 4) + Math.floor(n / 2) * (s.hi > 70 ? -1 : 1);
    daily.push({
      number: n + 1,
      name: n === 0 ? (day ? 'Today' : 'Tonight') : n === 1 && !day ? 'Tonight' : `${weekday(start + H, s.tz)}${day ? '' : ' Night'}`,
      startTime: new Date(start).toISOString(),
      endTime: new Date(t).toISOString(),
      isDaytime: day,
      temperature: (day ? s.hi : s.lo) + (n < 2 ? 0 : drift),
      temperatureUnit: 'F',
      windSpeed: `${Math.round(s.wspd * 1.15)} mph`,
      windDirection: dirName(s.wdir),
      shortForecast: n < 2 ? s.short : ['Sunny', 'Partly Cloudy', 'Mostly Cloudy', 'Chance Showers'][Math.floor(hash(id + n) * 4)],
      probabilityOfPrecipitation: { value: s.pop },
    });
    start = t;
  }
  return {
    point: { forecastZone: `fixture:${id}`, timeZone: s.tz, gridId: 'FIX' },
    hourly: { properties: { periods: hourly } },
    daily: { properties: { periods: daily } },
  };
}

// ---------- NWS alerts (GeoJSON FeatureCollection shape) ----------
export function alertsFC(now = Date.now()) {
  return {
    features: Object.entries(FIX)
      .filter(([, s]) => s.alert)
      .map(([id, s]) => ({
        id: `fixture-alert-${id}`,
        properties: {
          event: s.alert[0],
          severity: s.alert[1],
          headline: s.alert[2],
          ends: new Date(now + 6 * H).toISOString(),
          affectedZones: [`fixture:${id}`],
        },
      })),
  };
}

// ---------- USGS 2.5_day.geojson shape ----------
export function quakeFC(now = Date.now()) {
  const list = QUAKES.map(([mag, place, lat, lon, depth, ago], i) => ({ mag, place, lat, lon, depth, t: now - ago * H, i }));
  // Every few ticks a "new" event appears, so refresh visibly changes the hazard layer.
  if (tick > 0 && tick % 2 === 0) {
    list.unshift({ mag: 2.5 + Math.round(hash('q' + tick) * 25) / 10, place: '8 km NW of Cobb, CA (simulated)', lat: 38.87 + noise('la' + tick) * 0.1, lon: -122.79 + noise('lo' + tick) * 0.1, depth: 3, t: now - 60e3, i: 'n' + tick });
  }
  return {
    type: 'FeatureCollection',
    features: list.map((q) => ({
      type: 'Feature',
      id: `fx${q.i}`,
      properties: { mag: q.mag, place: q.place, time: Math.round(q.t), url: '#', tsunami: 0 },
      geometry: { type: 'Point', coordinates: [q.lon, q.lat, q.depth] },
    })),
  };
}
