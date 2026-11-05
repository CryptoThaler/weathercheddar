// Turns raw feeds into the numbers a trader actually looks at.
import { cToF } from './data.js';

const H = 3600e3;

export function localDay(t, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}

export function derive(st, obs = [], nws = null, alerts = [], now = Date.now()) {
  const latest = obs[obs.length - 1] || null;
  const tz = nws?.tz;
  const today = localDay(now, tz);
  const series = obs.filter((o) => o.tempC != null && o.t >= now - 24 * H).map((o) => ({ t: o.t, f: cToF(o.tempC) }));

  const todays = series.filter((p) => localDay(p.t, tz) === today);
  const obsHi = todays.length ? Math.max(...todays.map((p) => p.f)) : null;
  const obsLo = todays.length ? Math.min(...todays.map((p) => p.f)) : null;

  const threeAgo = series.filter((p) => p.t <= now - 2.75 * H).pop();
  const tempF = latest?.tempC != null ? cToF(latest.tempC) : null;
  const trend3h = tempF != null && threeAgo ? tempF - threeAgo.f : null;

  const hourly = nws?.hourly || [];
  const nowP = hourly.find((p) => p.start <= now && now < p.end) || hourly[0] || null;
  const fcstNow = nowP?.f ?? null;
  const fcst = hourly.filter((p) => p.end > now && p.start < now + 24 * H).map((p) => ({ t: Math.max(p.start, now), f: p.f }));

  // Forecast high for the local day: daily daytime period for today, else max of remaining hourly today.
  const daily = nws?.daily || [];
  const dayP = daily.find((p) => p.day && localDay(p.start, tz) === today);
  const hrsToday = hourly.filter((p) => localDay(p.start, tz) === today && p.end > now).map((p) => p.f);
  const remainHi = hrsToday.length ? Math.max(...hrsToday) : null;
  const nextDay = daily.find((p) => p.day && p.start > now) || null;
  // Today's forecast high: live "Today" period, else the high issued earlier today.
  const todayHi = dayP?.f ?? nws?.issuedHi ?? null;
  // Cards fall back to the next daytime period (labelled) once today's high is unavailable.
  const fcstHi = todayHi ?? nextDay?.f ?? null;
  const fcstHiLabel = todayHi != null ? 'today' : nextDay?.name || '';
  const nightP = daily.find((p) => !p.day && p.end > now);
  const fcstLo = nightP?.f ?? (hourly.length ? Math.min(...hourly.slice(0, 24).map((p) => p.f)) : null);

  const mine = alerts.filter((a) => a.zones.some((z) => nws?.zones?.includes(z)));

  return {
    st,
    latest,
    tempF,
    dewF: latest?.dewC != null ? cToF(latest.dewC) : null,
    trend3h,
    fcstNow,
    delta: tempF != null && fcstNow != null ? tempF - fcstNow : null,
    obsHi,
    obsLo,
    fcstHi,
    fcstHiLabel,
    todayHi,
    fcstLo,
    spread: fcstHi != null && fcstLo != null ? fcstHi - fcstLo : null,
    tdSpread: latest?.tempC != null && latest?.dewC != null ? cToF(latest.tempC) - cToF(latest.dewC) : null,
    // positive = already running hot vs the forecast high
    hiGap: obsHi != null && todayHi != null ? obsHi - todayHi : null,
    remainHi,
    nextDay,
    shortFcst: nowP?.short || dayP?.short || '',
    series,
    fcst,
    alerts: mine,
    ageMin: latest ? Math.round((now - latest.t) / 60e3) : null,
  };
}

// Temperature (°F) → color, cheddar-centric ramp.
const STOPS = [
  [0, [0.42, 0.62, 1.0]],
  [32, [0.45, 0.85, 0.95]],
  [50, [0.55, 0.9, 0.62]],
  [65, [1.0, 0.84, 0.36]],
  [78, [1.0, 0.63, 0.12]],
  [90, [1.0, 0.33, 0.2]],
  [105, [0.86, 0.12, 0.42]],
];
export function tempRGB(f) {
  if (f == null) return [0.5, 0.48, 0.42];
  if (f <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (f <= t1) {
      const k = (f - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return STOPS[STOPS.length - 1][1];
}
export const tempCSS = (f) => `rgb(${tempRGB(f).map((v) => Math.round(v * 255)).join(',')})`;
