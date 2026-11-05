import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/800.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/700.css';
import './style.css';
import gsap from 'gsap';
import { STATIONS, LIVE, advanceFixtures, loadMetar, loadNws, loadAlerts, loadQuakes, routeFor } from './data.js';
import { derive } from './derive.js';
import { renderCards, renderPanel, renderQuakes } from './ui.js';
import { FILTERS, matchesFilter } from './stations.js';
import { createRetro } from './retro.js';

const qs = new URLSearchParams(location.search);
// 5-minute auto-refresh; ?tick=<seconds> shortens it for demos.
const REFRESH_MS = Math.max(5, +qs.get('tick') || 300) * 1000;
const $ = (s) => document.querySelector(s);

const state = {
  obs: {},
  nws: {},
  alerts: [],
  quakes: [],
  sel: localStorage.getItem('wc_sel') || 'KNYC',
  filter: localStorage.getItem('wc_filter') || 'all',
  status: { metar: null, nws: null, alerts: null, usgs: null },
  nextAt: 0,
};

const hasGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch {
    return false;
  }
})();
let mode = qs.get('mode') || (() => { try { return localStorage.getItem('wc_mode'); } catch { return null; } })() || '3d';
if (!hasGL) mode = 'retro';

// ---------- views ----------
let globe = null;
const retro = createRetro($('#retro'), { onSelect: select });

async function ensureGlobe() {
  if (globe || !hasGL) return globe;
  const { createGlobe } = await import('./globe.js');
  globe = createGlobe($('#scene'), { onSelect: select });
  if (qs.has('debug')) window.__wc = { globe, state };
  render();
  return globe;
}

function derived() {
  const now = Date.now();
  return STATIONS.map((st) => derive(st, state.obs[st.id], state.nws[st.id], state.alerts, now));
}

let quakesDrawn = null;
function renderFilters(list) {
  $('#filters').innerHTML = FILTERS.map(([k, label]) => {
    const n = list.filter((d) => matchesFilter(d, k)).length;
    return `<button class="flt ${k === state.filter ? 'on' : ''} ${k === 'tx' ? 'flt-tx' : ''}" data-f="${k}" aria-pressed="${k === state.filter}">${label}<span>${n}</span></button>`;
  }).join('');
}

function render() {
  const list = derived();
  const vis = list.filter((d) => matchesFilter(d, state.filter));
  const shown = new Set(vis.map((d) => d.st.id));
  const sel = list.find((d) => d.st.id === state.sel) || list[0];
  renderFilters(list);
  renderCards($('#cards'), vis, state.sel);
  renderPanel($('#panel-body'), sel);
  renderQuakes($('#quakes'), state.quakes);
  globe?.updateStations(list, shown);
  if (globe && quakesDrawn !== state.quakes) (globe.updateQuakes(state.quakes), (quakesDrawn = state.quakes));
  retro.update(list, state.quakes, state.sel, shown);
  const nAlerts = new Set(vis.flatMap((d) => d.alerts.map((a) => a.id))).size;
  const hot = vis.filter((d) => d.hiGap != null).sort((a, b) => b.hiGap - a.hiGap)[0];
  $('#stat-alerts').textContent = nAlerts;
  $('#stat-quakes').textContent = state.quakes.length;
  $('#stat-max').textContent = state.quakes.length ? `M${Math.max(...state.quakes.map((q) => q.mag)).toFixed(1)}` : '--';
  $('#stat-hot').textContent = hot ? `${hot.st.id} ${hot.hiGap > 0 ? '+' : ''}${hot.hiGap.toFixed(1)}°` : '--';
}

function select(id) {
  state.sel = id;
  try { localStorage.setItem('wc_sel', id); } catch {}
  render();
  globe?.focus(id);
  if (matchMedia('(max-width: 820px)').matches) $('#panel').classList.add('open');
}

// ---------- data ----------
function setStatus(k, ok, err) {
  state.status[k] = { ok, t: Date.now(), err };
  const el = document.querySelector(`[data-src="${k}"]`);
  if (!el) return;
  el.className = `src ${ok ? 'ok' : 'err'}`;
  el.title = ok ? `${k.toUpperCase()} ok · ${new Date().toLocaleTimeString()}` : `${k.toUpperCase()} failed: ${err}`;
}

async function refresh() {
  $('#refresh').classList.add('spin');
  state.nextAt = Date.now() + REFRESH_MS;
  if (!LIVE && state.status.metar) advanceFixtures();
  const jobs = [
    loadMetar().then((o) => ((state.obs = o), setStatus('metar', true), render())).catch((e) => setStatus('metar', false, e.message)),
    loadQuakes().then((q) => ((state.quakes = q), setStatus('usgs', true), render())).catch((e) => setStatus('usgs', false, e.message)),
    loadAlerts().then((a) => ((state.alerts = a), setStatus('alerts', true), render())).catch((e) => setStatus('alerts', false, e.message)),
    (async () => {
      const r = await Promise.allSettled(
        STATIONS.map((st) => loadNws(st).then((n) => ((state.nws[st.id] = n), render())))
      );
      const bad = r.filter((x) => x.status === 'rejected');
      setStatus('nws', bad.length < r.length, bad.length ? `${bad.length}/${r.length} stations failed: ${bad[0].reason?.message}` : '');
    })(),
  ];
  await Promise.allSettled(jobs);
  $('#updated').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#route').textContent = !LIVE ? 'FIXTURE DATA · simulated feed' : ['aviationweather.gov', 'api.weather.gov', 'earthquake.usgs.gov'].some((h) => routeFor(h) === 'proxy') ? 'LIVE · via CORS proxy' : 'LIVE · direct';
  document.body.classList.toggle('fixture', !LIVE);
  $('#refresh').classList.remove('spin');
  render();
}

setInterval(() => {
  const s = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000));
  $('#countdown').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (globe) $('#fps').textContent = mode === '3d' ? `${Math.round(globe.fps)} fps` : '';
  if (s === 0 && !document.hidden) refresh();
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() > state.nextAt) refresh();
});
$('#refresh').addEventListener('click', refresh);

// ---------- mode toggle ----------
async function setMode(m, animate = true) {
  mode = m === 'retro' || !hasGL ? 'retro' : '3d';
  try { localStorage.setItem('wc_mode', mode); } catch {}
  document.body.dataset.mode = mode;
  $('#toggle').setAttribute('aria-pressed', mode === 'retro');
  $('#toggle .t-label').textContent = mode === '3d' ? 'RETRO BOARD' : '3D GLOBE';
  const show = mode === '3d' ? $('#modern') : $('#retro');
  const hide = mode === '3d' ? $('#retro') : $('#modern');
  if (mode === '3d') await ensureGlobe();
  globe?.setActive(mode === '3d');
  if (!animate) {
    hide.hidden = true;
    show.hidden = false;
    return;
  }
  gsap.timeline()
    .to(hide, { autoAlpha: 0, scale: 0.98, filter: 'blur(6px)', duration: 0.35, ease: 'power2.in', onComplete: () => (hide.hidden = true) })
    .call(() => (show.hidden = false))
    .fromTo(show, { autoAlpha: 0, scale: 1.02, filter: 'blur(6px)' }, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power2.out', clearProps: 'filter,transform' });
}
$('#toggle').addEventListener('click', () => setMode(mode === '3d' ? 'retro' : '3d'));
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'r' || e.key === 'R') setMode(mode === '3d' ? 'retro' : '3d');
  if (e.key === 'h' || e.key === 'H') globe?.goHome();
});
$('#cards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) select(b.dataset.id);
});
$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  state.filter = b.dataset.f;
  try { localStorage.setItem('wc_filter', state.filter); } catch {}
  render();
  gsap.fromTo('#cards .card', { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.025, duration: 0.35, ease: 'power2.out' });
});
$('#home').addEventListener('click', () => globe?.goHome());
$('#panel-close').addEventListener('click', () => $('#panel').classList.remove('open'));
if (!hasGL) $('#toggle').disabled = true;

// ---------- boot ----------
render();
setMode(mode, false);
gsap.from('.brand > *', { y: -12, autoAlpha: 0, stagger: 0.08, duration: 0.6, ease: 'power3.out' });
refresh();
