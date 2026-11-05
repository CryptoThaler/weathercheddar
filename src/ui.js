// Modern-mode DOM: station chips, detail panel, 24h obs+forecast chart, hazards.
import { tempCSS } from './derive.js';
import { settlementNote } from './stations.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f0 = (v) => (v == null ? '--' : Math.round(v));
const sgn = (v, d = 0) => (v == null ? '--' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`);
const H = 3600e3;

function windStr(o) {
  if (!o || o.wspd == null) return '--';
  if (o.wspd === 0) return 'Calm';
  return `${o.wdir === 'VRB' ? 'VRB' : `${o.wdir}°`} ${o.wspd}${o.wgst ? `G${o.wgst}` : ''} kt`;
}
const ceil = (o) => {
  const c = (o?.clouds || []).find((c) => /BKN|OVC|OVX|VV/.test(c.cover));
  return c ? `${c.cover} ${c.base?.toLocaleString()} ft` : (o?.clouds?.[0]?.cover === 'CLR' || o?.clouds?.[0]?.cover === 'SKC' ? 'Clear' : (o?.clouds || []).map((c) => c.cover).join(' ') || '--');
};

export function chartSVG(obs, fcst, now = Date.now(), w = 360, h = 140) {
  const pts = [...obs, ...fcst].filter((p) => p.f != null);
  if (!pts.length) return `<svg viewBox="0 0 ${w} ${h}" class="chart"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="muted">No series yet</text></svg>`;
  const t0 = now - 24 * H, t1 = now + 24 * H;
  let lo = Math.min(...pts.map((p) => p.f)), hi = Math.max(...pts.map((p) => p.f));
  if (hi - lo < 6) (lo -= 3), (hi += 3);
  lo = Math.floor(lo - 1);
  hi = Math.ceil(hi + 1);
  const P = { l: 30, r: 8, t: 10, b: 20 };
  const x = (t) => P.l + ((t - t0) / (t1 - t0)) * (w - P.l - P.r);
  const y = (f) => P.t + (1 - (f - lo) / (hi - lo)) * (h - P.t - P.b);
  const path = (a) => a.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.f).toFixed(1)}`).join('');
  const area = obs.length ? `${path(obs)}L${x(obs.at(-1).t).toFixed(1)},${h - P.b}L${x(obs[0].t).toFixed(1)},${h - P.b}Z` : '';
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const hrs = [-24, -12, 0, 12, 24];
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Observed last 24 hours and NWS forecast next 24 hours">
    <defs><linearGradient id="g-obs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".35"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((f) => `<line x1="${P.l}" x2="${w - P.r}" y1="${y(f)}" y2="${y(f)}" class="grid"/><text x="${P.l - 5}" y="${y(f) + 3}" text-anchor="end" class="ax">${f}°</text>`).join('')}
    ${hrs.map((k) => `<text x="${x(now + k * H)}" y="${h - 5}" text-anchor="middle" class="ax">${k === 0 ? 'now' : (k > 0 ? '+' : '') + k + 'h'}</text>`).join('')}
    <line x1="${x(now)}" x2="${x(now)}" y1="${P.t}" y2="${h - P.b}" class="now"/>
    ${area ? `<path d="${area}" fill="url(#g-obs)"/>` : ''}
    ${obs.length ? `<path d="${path(obs)}" class="obs"/>` : ''}
    ${fcst.length ? `<path d="${path(fcst)}" class="fc"/>` : ''}
    ${obs.length ? `<circle cx="${x(obs.at(-1).t)}" cy="${y(obs.at(-1).f)}" r="3.5" class="dot"/>` : ''}
  </svg>`;
}

function spark(obs, fcst, now = Date.now(), w = 120, h = 30) {
  const pts = [...obs, ...fcst].filter((p) => p.f != null);
  if (pts.length < 2) return '';
  const t0 = now - 24 * H, t1 = now + 24 * H;
  const lo = Math.min(...pts.map((p) => p.f)) - 1, hi = Math.max(...pts.map((p) => p.f)) + 1;
  const x = (t) => ((t - t0) / (t1 - t0)) * w, y = (f) => h - ((f - lo) / (hi - lo)) * h;
  const d = (a) => a.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.f).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><line x1="${w / 2}" x2="${w / 2}" y1="0" y2="${h}" class="now"/>${obs.length ? `<path d="${d(obs)}" class="obs"/>` : ''}${fcst.length ? `<path d="${d(fcst)}" class="fc"/>` : ''}</svg>`;
}

// Station cards: current temp, forecast hi/lo, spread, 24h obs + forecast sparkline.
export function renderCards(el, list, sel) {
  el.innerHTML = list
    .map(
      (d) => `<button class="card ${d.st.id === sel ? 'sel' : ''} ${d.alerts.length ? 'alert' : ''} ${d.st.tx ? 'tx' : ''}" data-id="${d.st.id}" style="--c:${tempCSS(d.tempF)}" aria-label="${esc(d.st.city)} ${f0(d.tempF)} degrees">
      <div class="c-top"><span class="c-id">${d.st.id}</span><span class="cat cat-${esc(d.latest?.cat)}">${esc(d.latest?.cat || '--')}</span>${d.alerts.length ? '<span class="c-haz" title="Active alert">⚠</span>' : ''}</div>
      <div class="c-city">${d.st.tx ? '<span class="tx-tag">TX</span>' : ''}${esc(d.st.city)}</div>
      <div class="kalshi" title="${esc(settlementNote(d.st))}">KALSHI SETTLEMENT · ${d.st.cli}</div>
      <div class="c-mid"><span class="c-t">${f0(d.tempF)}°</span>
        <span class="c-hl" title="Forecast high (${esc(d.fcstHiLabel)}) / low"><b>H ${f0(d.fcstHi)}°</b><b>L ${f0(d.fcstLo)}°</b></span></div>
      <div class="c-stats"><span title="Forecast high minus low">spread ${f0(d.spread)}°</span><span title="Temperature minus dewpoint">T–Td ${f0(d.tdSpread)}°</span><span class="${d.delta > 0 ? 'up' : d.delta < 0 ? 'dn' : ''}" title="Observed minus NWS hourly forecast">Δ ${d.delta == null ? '--' : sgn(d.delta, 1)}</span></div>
      ${spark(d.series, d.fcst)}
    </button>`
    )
    .join('');
}

export function renderPanel(el, d) {
  if (!d) return (el.innerHTML = '<p class="muted">Select a station.</p>');
  const o = d.latest;
  const alt = o?.altHpa != null ? `${(o.altHpa * 0.02953).toFixed(2)} inHg` : '--';
  el.innerHTML = `
    <header class="p-head">
      <div><div class="p-id">${d.st.id}<span class="cat cat-${esc(o?.cat)}">${esc(o?.cat || '--')}</span></div><div class="p-city">${d.st.tx ? '<span class="tx-tag">TX</span>' : ''}${esc(d.st.city)} · ${d.st.st} · WFO ${d.st.wfo}</div></div>
      <div class="p-temp" style="--c:${tempCSS(d.tempF)}">${f0(d.tempF)}<small>°F</small></div>
    </header>
    <div class="p-sub">${o ? `obs ${d.ageMin} min ago` : 'no obs'}${d.trend3h != null ? ` · 3h ${sgn(d.trend3h, 1)}°` : ''}${d.shortFcst ? ` · ${esc(d.shortFcst)}` : ''}</div>
    <div class="kpis">
      <div class="kpi"><label>NWS fcst now</label><b>${f0(d.fcstNow)}°</b><em class="${d.delta > 0 ? 'up' : d.delta < 0 ? 'dn' : ''}">${d.delta == null ? '' : `${sgn(d.delta, 1)}° vs obs`}</em></div>
      <div class="kpi hot"><label>Today hi · obs so far</label><b>${f0(d.obsHi)}°</b><em>low ${f0(d.obsLo)}°</em></div>
      <div class="kpi hot"><label>Today hi · NWS fcst</label><b>${f0(d.todayHi)}°</b><em class="${d.hiGap > 0 ? 'up' : d.hiGap < 0 ? 'dn' : ''}">${d.hiGap == null ? '' : `gap ${sgn(d.hiGap, 1)}°`}</em></div>
      <div class="kpi"><label>Fcst low · spread</label><b>${f0(d.fcstLo)}°</b><em>H–L ${f0(d.spread)}° · T–Td ${f0(d.tdSpread)}°</em></div>
    </div>
    <div class="chart-wrap">
      <div class="legend"><span class="l-obs">METAR · past 24h</span><span class="l-fc">NWS hourly · next 24h</span></div>
      ${chartSVG(d.series, d.fcst)}
    </div>
    <dl class="obs-grid">
      <div><dt>Dewpoint</dt><dd>${f0(d.dewF)}°F</dd></div>
      <div><dt>Wind</dt><dd>${windStr(o)}</dd></div>
      <div><dt>Visibility</dt><dd>${esc(o?.visRaw ?? '--')} sm</dd></div>
      <div><dt>Ceiling</dt><dd>${esc(ceil(o))}</dd></div>
      <div><dt>Altimeter</dt><dd>${alt}</dd></div>
      <div><dt>Wx</dt><dd>${esc(o?.wx || '—')}</dd></div>
    </dl>
    <pre class="raw">${esc(o?.raw || 'No METAR')}</pre>
    <div class="settle"><span class="kalshi">KALSHI SETTLEMENT · ${d.st.cli}</span><p>${esc(settlementNote(d.st))} Obs-so-far high uses the same climate day; the official value is the CLI report, not METAR.</p></div>
    <section class="haz">
      <h4>Hazards</h4>
      ${d.alerts.length ? d.alerts.map((a) => `<div class="alert-row sev-${esc(a.severity)}"><b>${esc(a.event)}</b><span>${esc(a.headline || '')}</span></div>`).join('') : '<p class="muted">No active NWS alerts for this station’s zones.</p>'}
    </section>`;
}

export function renderQuakes(el, qs) {
  const top = (qs || []).slice(0, 6);
  el.innerHTML = top.length
    ? top
        .map(
          (q) => `<a class="q-row" href="${esc(q.url)}" target="_blank" rel="noopener"><b class="m${q.mag >= 5 ? 5 : q.mag >= 4 ? 4 : 3}">M${q.mag.toFixed(1)}</b><span>${esc(q.place)}</span><time>${Math.max(0, Math.round((Date.now() - q.t) / 60e3 / 60))}h</time></a>`
        )
        .join('')
    : '<p class="muted">No USGS data.</p>';
}
