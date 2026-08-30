# HARMONIE Model — `uwcw-ha-det-nl-s1` v1.0

> All structure facts verified against a real file (`uwcw-ha-det-nl-2km_20260830T11_total-precipitation-accumulation-01h-gl.nc`, 7,267,849 bytes) on 2026-08-30.

## Dataset

- "Atmospheric model HARMONIE Dutch domain set 1 — common near surface model parameters" (UWC-West HARMONIE, Dutch domain, 2 km grid).
- **⚠ "Still under active development — parameter content may change."** Decoder must tolerate parameter renames/removal; health checks should surface decode failures per parameter.
- Forecast: **hourly steps, 60 h horizon**, new cycle every hour. License CC BY 4.0.

## Files

- Naming: `uwcw-ha-det-nl-2km_<YYYYMMDD>T<HH>_<parameter>.nc` — one file per parameter per cycle.
- Cycle label = model init time (UTC). **Latency: cycle T11 became available ~13:30** (≈2.5 h after init, verified). First forecast step is t+1h. ⇒ At availability, the first ~2 hours of each cycle are already in the past. Radar covers that window (0–2 h); HARMONIE is used from its first still-future step onward. This is inherent to NWP — not a bug.
- Precip file size: ~7.3 MB compressed. Retention: 1 file/h → 175 MB/day if kept for 24 h. Keep only the **latest cycle per hour** for 48 h (≈350 MB), or prune aggressively (last 4 cycles).

## Precipitation parameters (verified names)

| Parameter | Units | Semantics | Size |
|---|---|---|---|
| `total-precipitation-accumulation-01h-gl` | mm | total precip accumulated over the **past 1 h** at ground level, per hourly step | ~7–8 MB |
| `total-precipitation-rate-gl` | mm/h | instantaneous rate | ~7 MB |
| `rainfall-*`, `snowfall-*`, `graupel-*`, `solid-precipitation-*` | — | phase-split variants (not needed V1) | small |

**V1 choice: `total-precipitation-accumulation-01h-gl`.** Rationale: hourly accumulation = exact average mm/h over the hour, directly integrable for event extraction and horizon accumulation; avoids instantaneous-rate spikes. (Rate variant available if finer interpretation is ever needed.)

## NetCDF4 structure (verified)

```
forecast_reference_time  int64 scalar — epoch seconds (cycle init time)
time                     int64 [60]    — epoch seconds; steps at ref+1h .. ref+60h
latitude                 float64 [390] — 49.000..56.002, step 0.018°  (regular)
longitude                float64 [390] — 0.000..11.281, step 0.029°   (regular)
gl                       int64 [1]     — ground level (always 0)
total-precipitation-accumulation-01h-gl  float32 [60, 1, 390, 390]
   attrs: units=mm, standard_name=precipitation_amount, _FillValue=NaN
   grid_mapping: latitude_longitude (+proj=longlat +a=6371229)
```

- Regular lat-lon grid (EPSG:4326), 2 km at these latitudes. Nearest-cell index via the in-file lat/lon arrays (argmin over 390 values — trivial).
- **Verified reference point: Amsterdam West (52.37, 4.85) → lat_i=187, lon_i=167.**
- Verified live values at that cell: `[0.039, 0.335, 0.065, 0.040, 0.006, 0.0, …]` mm — plausible drizzle field.

## Cycle selection

1. List newest files (`sorting=desc&orderBy=lastModified`) filtered to `total-precipitation-accumulation-01h-gl`.
2. Pick the newest **available** file = latest cycle. Read `forecast_reference_time` from inside the file — never infer from the filename alone (SPEC §49: never infer freshness from download time).
3. Optionally check whether a *newer* cycle exists whose file isn't there yet — not needed; the newest available cycle IS the best data.

## Extraction recipe (per cycle)

1. Download the precip `.nc` (~7.3 MB).
2. Read `latitude`, `longitude` arrays → nearest index to configured location.
3. Read `forecast_reference_time`, `time[60]` → absolute UTC timestamps per step.
4. Read the 60 values at `[t, 0, lat_i, lon_i]` — NaN → null/0 semantics per normalization layer.
5. Interpret: value at step k = mm accumulated 01:00–00:00 before `time[k]` (i.e. the hour ENDING at time[k]). Attach each value to hour-ending timestamp (or hour-start t−1h; be consistent and test it).
6. Emit `SourceForecastPoint[]` — 60 points, hourly, horizon t+1..t+60 h from cycle init.
7. Metadata: `runGeneratedAt` = cycle init (epoch → ISO), `dataset=uwcw-ha-det-nl-s1/1.0`.

## Pitfalls

- `time[0]` = ref + 3600 — there is **no t+0 step**. Horizon accounting must start at +1 h.
- Values are mm per hour (accumulation), NOT rates — semantic differs from radar's 5-min sums; normalization layer converts both to `precipitationMmPerHour` (SPEC §7).
- NaN = fill value (HDF5 `_FillValue`); mask before fusion.
- Dataset is "under active development" — wrap decoding in tolerant parsing with per-parameter health reporting; a parameter rename must degrade gracefully, not crash the pipeline (SPEC §35).
