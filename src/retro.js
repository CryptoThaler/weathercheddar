// Original-style ASCII / split-flap station board.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+-.°';
const pad = (s, n, right) => {
  s = String(s ?? '');
  return s.length >= n ? s.slice(0, n) : right ? s.padStart(n) : s.padEnd(n);
};
const f0 = (v, suf = '') => (v == null ? '--' : `${Math.round(v)}${suf}`);
const sgn = (v) => (v == null ? '--' : `${v > 0 ? '+' : ''}${Math.round(v)}`);

function wind(o) {
  if (!o || o.wspd == null) return '-----';
  if (o.wspd === 0) return 'CALM';
  const d = o.wdir === 'VRB' ? 'VRB' : String(o.wdir ?? '---').padStart(3, '0');
  return `${d}/${String(o.wspd).padStart(2, '0')}${o.wgst ? 'G' + o.wgst : ''}`;
}

const COLS = [
  ['STN', 5], ['CITY', 22], ['TMP', 5, 1], ['DEW', 5, 1], ['WIND', 10], ['VIS', 5, 1], ['ALT', 6, 1],
  ['CAT', 5], ['FC/NOW', 7, 1], ['Δ', 5, 1], ['HI.OBS', 7, 1], ['HI.FC', 6, 1], ['GAP', 5, 1], ['HAZ', 4],
];

function rowCells(d) {
  const o = d.latest;
  return [
    d.st.id,
    d.st.city.toUpperCase(),
    f0(d.tempF, 'F'),
    f0(d.dewF, 'F'),
    wind(o),
    o?.visRaw ?? '--',
    o?.altHpa != null ? (o.altHpa * 0.02953).toFixed(2) : '--',
    o?.cat ?? '--',
    f0(d.fcstNow, 'F'),
    sgn(d.delta),
    f0(d.obsHi, 'F'),
    f0(d.todayHi, 'F'),
    sgn(d.hiGap),
    d.alerts.length ? `!${d.alerts.length}` : '',
  ];
}

const box = (lines, w = 72) => ['+' + '='.repeat(w) + '+', ...lines.map((l) => '|' + l.padStart(Math.floor((w + l.length) / 2)).padEnd(w) + '|'), '+' + '='.repeat(w) + '+'].join('\n');
const BANNER = box(['METAR-FIRST AVIATION CONSOLE', '', 'W E A T H E R    C H E D D A R', '', 'ACTIONABLE INTELLIGENCE AS A SERVICE FOR MAKING THAT KALSHI CHEESE']);

export function createRetro(root, { onSelect } = {}) {
  root.innerHTML = `
    <div class="crt">
      <pre class="banner" aria-hidden="true">${BANNER}</pre>
      <div class="r-head"></div>
      <div class="r-board" role="table" aria-label="Station board"></div>
      <div class="r-cols">
        <section><h3>&gt; RAW METAR</h3><pre class="r-raw"></pre></section>
        <section><h3>&gt; HAZARDS · NWS ALERTS</h3><pre class="r-haz"></pre></section>
        <section><h3>&gt; USGS M2.5+ · PAST DAY</h3><pre class="r-quake"></pre></section>
      </div>
    </div>`;
  const board = root.querySelector('.r-board');
  const head = root.querySelector('.r-head');
  head.textContent = COLS.map(([n, w, r]) => pad(n, w, r)).join(' ');
  const rows = new Map();
  board.addEventListener('click', (e) => {
    const r = e.target.closest('[data-id]');
    if (r) onSelect?.(r.dataset.id);
  });

  function flap(span, text) {
    if (span.dataset.v === text) return;
    span.dataset.v = text;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return (span.textContent = text);
    let n = 0;
    const tick = () => {
      n++;
      span.textContent = [...text].map((ch, i) => (ch === ' ' || n > 6 + i * 0.6 ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
      if (n < 8 + text.length * 0.6) requestAnimationFrame(tick);
      else span.textContent = text;
    };
    tick();
  }

  return {
    update(list, quakes, sel) {
      for (const d of list) {
        let r = rows.get(d.st.id);
        if (!r) {
          r = document.createElement('div');
          r.className = 'r-row';
          r.setAttribute('role', 'row');
          r.dataset.id = d.st.id;
          r.innerHTML = COLS.map(() => '<span role="cell"></span>').join(' ');
          board.appendChild(r);
          rows.set(d.st.id, r);
        }
        r.classList.toggle('sel', d.st.id === sel);
        r.dataset.cat = d.latest?.cat || '';
        r.classList.toggle('haz', d.alerts.length > 0);
        const cells = rowCells(d);
        [...r.children].forEach((s, i) => flap(s, pad(cells[i], COLS[i][1], COLS[i][2])));
      }
      root.querySelector('.r-raw').textContent = list.map((d) => d.latest?.raw || `${d.st.id} ---- NO DATA ----`).join('\n');
      const haz = list.flatMap((d) => d.alerts.map((a) => `${d.st.id}  ${pad(a.event?.toUpperCase(), 28)} ${a.severity || ''}`));
      root.querySelector('.r-haz').textContent = haz.length ? [...new Set(haz)].join('\n') : 'NO ACTIVE ALERTS FOR TRACKED STATIONS';
      root.querySelector('.r-quake').textContent =
        (quakes || [])
          .slice(0, 12)
          .map((q) => `M${q.mag.toFixed(1)}  ${new Date(q.t).toISOString().slice(11, 16)}Z  ${pad((q.place || '').toUpperCase(), 40)}`)
          .join('\n') || 'NO DATA';
    },
  };
}
