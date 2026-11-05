// Kalshi climate-contract station list (24). Single source of truth: data/stations.json
// (also used by data/fetchers.js and the agent). wfo = NWS office issuing the station's
// Daily Climate Report (CLI). Always confirm the settlement source in each Kalshi contract's rules.
import DATA from '../data/stations.json' with { type: 'json' };

export const STATIONS = DATA.stations.map((s) => ({
  id: s.icao,
  city: s.name,
  st: s.state,
  lat: s.lat,
  lon: s.lon,
  tz: s.tz,
  wfo: s.wfo,
  cli: s.cli,
  region: s.region,
  tx: s.texas,
  alertArea: s.nws_alert_area,
}));

export const BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

export const settlementNote = (s) =>
  `Kalshi settlement: NWS Daily Climate Report ${s.cli} (WFO ${s.wfo}) for ${s.id}. Climate day runs midnight–midnight local standard time.`;

export const FILTERS = [
  ['all', 'All'],
  ['tx', 'Texas'],
  ['east', 'East'],
  ['central', 'Central'],
  ['mountain', 'Mountain'],
  ['west', 'West'],
  ['alerts', 'Alerts'],
];
export const matchesFilter = (d, f) =>
  f === 'all' ? true : f === 'tx' ? !!d.st.tx : f === 'alerts' ? d.alerts.length > 0 : d.st.region === f;
