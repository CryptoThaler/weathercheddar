// Kalshi climate-contract station list (24). Coordinates are the ASOS sites.
// wfo = NWS forecast office that issues the station's Daily Climate Report (CLI).
// Always confirm the exact settlement source in each contract's rules on Kalshi.
const S = (id, city, st, lat, lon, tz, wfo, extra = {}) => ({ id, city, st, lat, lon, tz, wfo, cli: `CLI${id.slice(1)}`, ...extra });
const NY = 'America/New_York', CHI = 'America/Chicago', DEN = 'America/Denver', PHX = 'America/Phoenix', LA = 'America/Los_Angeles';

export const STATIONS = [
  S('KATL', 'Atlanta', 'GA', 33.6367, -84.4281, NY, 'FFC'),
  S('KAUS', 'Austin', 'TX', 30.1945, -97.6699, CHI, 'EWX', { tx: true }),
  S('KBOS', 'Boston', 'MA', 42.3656, -71.0096, NY, 'BOX'),
  S('KMDW', 'Chicago Midway', 'IL', 41.7868, -87.7522, CHI, 'LOT'),
  S('KDFW', 'Dallas / Fort Worth', 'TX', 32.8968, -97.038, CHI, 'FWD', { tx: true }),
  S('KDEN', 'Denver', 'CO', 39.8467, -104.6562, DEN, 'BOU'),
  S('KHOU', 'Houston Hobby', 'TX', 29.6454, -95.2789, CHI, 'HGX', { tx: true }),
  S('KLAS', 'Las Vegas', 'NV', 36.0801, -115.1522, LA, 'VEF'),
  S('KLAX', 'Los Angeles', 'CA', 33.9425, -118.4081, LA, 'LOX'),
  S('KSDF', 'Louisville', 'KY', 38.1744, -85.736, NY, 'LMK'),
  S('KMIA', 'Miami', 'FL', 25.7932, -80.2906, NY, 'MFL'),
  S('KMSP', 'Minneapolis', 'MN', 44.8848, -93.2223, CHI, 'MPX'),
  S('KMSY', 'New Orleans', 'LA', 29.9934, -90.258, CHI, 'LIX'),
  S('KNYC', 'NYC Central Park', 'NY', 40.7789, -73.9692, NY, 'OKX'),
  S('KEWR', 'Newark', 'NJ', 40.6925, -74.1687, NY, 'OKX'),
  S('KOKC', 'Oklahoma City', 'OK', 35.3931, -97.6007, CHI, 'OUN'),
  S('KPHL', 'Philadelphia', 'PA', 39.8721, -75.2411, NY, 'PHI'),
  S('KPHX', 'Phoenix', 'AZ', 33.4342, -112.0116, PHX, 'PSR'),
  S('KSAT', 'San Antonio', 'TX', 29.5337, -98.4698, CHI, 'EWX', { tx: true }),
  S('KSAN', 'San Diego', 'CA', 32.7336, -117.1897, LA, 'SGX'),
  S('KSFO', 'San Francisco', 'CA', 37.619, -122.3749, LA, 'MTR'),
  S('KSEA', 'Seattle', 'WA', 47.4502, -122.3088, LA, 'SEW'),
  S('KTTN', 'Trenton', 'NJ', 40.2767, -74.8135, NY, 'PHI'),
  S('KDCA', 'Washington National', 'VA', 38.8521, -77.0377, NY, 'LWX'),
].map((s) => ({ ...s, region: { [NY]: 'east', [CHI]: 'central', [DEN]: 'mountain', [PHX]: 'mountain', [LA]: 'west' }[s.tz] }));

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
