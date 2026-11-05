# agent/: Kalshi high-temperature bin pricer

`kalshi-bins.mjs` pulls METAR and NWS hourly/daily forecasts for the Texas Kalshi stations (**KSAT, KAUS, KDFW, KHOU** by default; any of the 24 via `--stations`). It turns them into a probability for each daily-high bin, a fair price in cents, and optionally the **spread** against market prices you supply.

Node ≥ 20.10. No dependencies; it reuses `data/fetchers.js` and `data/stations.json`.

```bash
npm run agent:fixtures                       # offline sample data (no network)
npm run agent                                # live: aviationweather.gov + api.weather.gov
node agent/kalshi-bins.mjs --stations KNYC,KMDW,KAUS
node agent/kalshi-bins.mjs --anchor 0 --prices agent/prices.example.json
node agent/kalshi-bins.mjs --json > bins.json
```

| flag | default | meaning |
|---|---|---|
| `--stations` | `KSAT,KAUS,KDFW,KHOU` | comma list from `data/stations.json` |
| `--fixtures` | off | routes every request to the dashboard's fixture generators through the same parsers |
| `--bin-width` | `2` | °F per interior bin |
| `--bins` | `6` | interior bins (plus `<=` and `>=` tails) centered on the median |
| `--anchor` | none | force bin lower edges ≡ anchor (mod width), e.g. `0` for even-starting bins. Use it to match the contract's actual bracket edges |
| `--prices` | none | JSON `{ICAO: {binLabel: yesPriceCents}}`. Adds `mkt¢` and `spread = fair − price` (positive means the model thinks YES is cheap) |
| `--user-agent` | repo UA | sent to NWS. Include your contact details |
| `--json` | off | machine-readable output |

## Model

```
H     = max(ObsHi, X),   X ~ Normal(μ, σ)
ObsHi = highest METAR temp so far in the climate day (local standard time), incl. 6-h max groups
μ     = remaining NWS hourly peak (averaged with the NWS "Today" high while the peak is ahead)
        + 0.5 × current anomaly (latest obs − NWS hourly forecast for this hour)
σ     = 1.0 + 0.2 °F per hour until the forecast peak, clamped to 0.8–4.0 (0.3 once no forecast hours remain)
P(k)  = P(k − 0.5 ≤ H < k + 0.5)   (the CLI reports whole °F)
```

Example output at 09:00 CST, fixture data, `--anchor 0` with the example prices:

```
KAUS Austin · CLIAUS · climate day 2026-11-05
  now 69.4°F  obs-hi 69.4°F  NWS today-hi 80°F  remaining peak 80°F
  model μ 79.2°F σ 2  (anomaly -1.6, 5h to peak)
  bin           P   fair¢   mkt¢  spread
  76-77     16.3%    16.3
  78-79     36.1%    36.1     22   +14.1
  80-81     31.7%    31.7     38    -6.3
  82-83     11.1%    11.1     18    -6.9
```

## Caveats (read before trading)

- **This model is uncalibrated.** σ, the 0.5 anomaly weight and the blend are placeholders. Backtest against past CLI reports before trusting any number.
- **Settlement uses the NWS CLI report**, which draws on ASOS 1-minute data. Hourly METARs can miss the true peak; the 6-h max groups (00/06/12/18Z) narrow that gap, but the CLI value can still differ.
- **The climate day uses local standard time**, so during DST it runs 01:00–01:00 clock time. The agent handles this; your own spreadsheets might not.
- **Bracket edges and tails differ per contract.** Set `--bin-width` and `--anchor` from the contract's actual bins, and check them against Kalshi's rules for each market.
- **Market prices are your input.** The agent doesn't call the Kalshi API. `prices.example.json` contains made-up numbers.
- **Live mode is untested here.** It was built and tested offline (fixtures plus parser unit checks). The build environment can't reach aviationweather.gov or api.weather.gov, so run `npm run agent` yourself first.
