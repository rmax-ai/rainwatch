# Radar Nowcast — `radar_forecast` v2.0

> All structure facts verified against a real file (`RAD_NL25_RAC_FM_202608301340.h5`, 414,730 bytes) on 2026-08-30.

## Dataset

- Dataset page: dataplatform.knmi.nl/dataset/radar-forecast-2-0 — "Precipitation — 5 minute radar nowcast over The Netherlands up to 2 hours ahead"
- pySTEPS-based deterministic nowcast, initiated with RTCOR-5m (real-time 5-min QPE).
- KNMI plan: this product "will eventually replace the current radar-based precipitation forecast" — it is the production nowcast.
- License CC BY 4.0. Update frequency: continual (verified: new file every 5 min, latency ~45–105 s after nominal time).

## Files

- Naming: `RAD_NL25_RAC_FM_<YYYYMMDDHHmm>.h5` — UTC timestamp = forecast issue time.
- Size: ~410 KB (25 steps × 765×700 × uint16, compressed). Trivial to download whole.
- Cadence: every 5 minutes → 288 files/day → ~118 MB/day if retained raw.

## HDF5 structure (verified)

```
geographic/
  attrs: geo_number_columns=[700], geo_number_rows=[765]
         geo_pixel_size_x=[1.] km, geo_pixel_size_y=[-1.]
         geo_column_offset=[0.], geo_row_offset=[3650.]
         geo_pixel_def=LU
  map_projection/ attrs: projection_name=STEREOGRAPHIC
         projection_proj4_params: +proj=stere +lat_0=90 +lon_0=0 +lat_ts=60
                                  +a=6378137 +b=6356752 +x_0=0 +y_0=0 +units=km
image1..image25/            (25 groups, one per +5 min step)
  attrs: image_datetime_valid (e.g. "30-AUG-2026;13:40:00.000")
         image_product_name=RAD_NL25_COR_NA, image_geo_parameter=PRECIP_[MM]
  calibration/ attrs: calibration_formulas="GEO=0.010000*PV+0.000000"
                      calibration_missing_data=[65534]
                      calibration_out_of_image=[65535]
  image_data/ dataset uint16 shape [765, 700]  (CLASS=IMAGE, DISPLAY_ORIGIN=UL)
```

- **Units:** each `image_data` value PV = 5-minute precipitation sum; `GEO = 0.01 × PV` mm. For mm/h: `mm/h = PV × 0.01 × 12`.
- **Steps:** image i valid at issue_time + (i−1)×5 min. Filename time = step-1 validity (verified: image1 13:40, image10 14:25).

## Grid mapping (verified)

Projection: polar stereographic, units km, origin (0,0) at lat 90/lon 0, `+lat_ts=60`, ellipsoid a=6378.137 b=6356.752. **NOTE: the proj4 y-axis is negated vs KNMI's row convention** — KNMI y grows southward from the pole.

KNMI convention (from their example code, cross-checked empirically):
```
r      = sqrt(x² + (row_offset + row)²)          # row_offset = 3650, row 0 = NORTH edge
lat    = 90 − 2·atan(r / (2·a·k0))                # k0 = (1 + sin 60°)/2 = 0.9330127
lon    = atan2(x, 3650 + row)
```

Forward (lat/lon → grid), equivalent form:
```
y_pyproj = proj4 transform y (negative for NL)
row      = −y_pyproj − 3650          # verified: row 0 ↔ 55.97N, row 764 ↔ ~48.9N
col      = x_pyproj                  # x in km, 0..700 → lon 0..~8.4°E
```

**Verified reference point — Amsterdam West (52.37 N, 4.85 E) → col=343, row=398.**
Sanity: row 0 at 55.97 N (dataset north bound), row 764 ≈ 48.9 N (south bound) — matches metadata bounds.

Implementation options:
- `proj4` npm package with the exact KNMI proj4 string (recommended — battle-tested), or
- closed-form stereographic forward formula (~10 lines, no dep). Either way: **fixture-test against the (52.37, 4.85) → (343, 398) reference point** and a second point (e.g. (52.955, 4.79) Den Helder radar site).

## Extraction recipe (per cycle)

1. List newest file (`sorting=desc&orderBy=lastModified&maxKeys=1`) → download (~410 KB).
2. Open HDF5 → read `image1..image25/image_data` as uint16 arrays (or subset each).
3. `mm_h[i] = PV[i][row][col] × 0.12`; mask 65534/65535 → 0.
4. Timestamps: `issue + i×5min` (from filename + image_datetime_valid).
5. Emit `SourceForecastPoint[]` — 25 points, 5-min spacing, 0–120 min horizon.
6. Metadata: `runGeneratedAt` = issue time, `dataset=radar_forecast/2.0`.

## Pitfalls

- Do NOT interpret values as mm/h directly — they are 5-min sums (×12).
- Row mapping: naive `row = (3650 − y_pyproj)` is WRONG (places 52.37 N out of grid); use the verified formula.
- Fill values 65534 (missing) and 65535 (out of image) must be masked before fusion.
- File naming time is UTC; all internal timestamps stay UTC (SPEC §7).
