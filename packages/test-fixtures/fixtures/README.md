# Fixtures — synthetic scenarios for offline replay (SPEC §39, §44)

Format: one JSON file per source, named `radar.json` / `harmonie.json`, each in
`SourceForecast` shape (SPEC §15): `{ "source": ForecastSourceMetadata, "points": SourceForecastPoint[] }`.

Base time: 2026-08-30T12:00:00Z (radar run). HARMONIE run = base − 2h (matches
the ~2.5h model latency found in Phase 1 research; first step = +1h).

| Scenario          | Contents |
|-------------------|----------|
| rainy-day         | §12 shower at +40–65 min, small shower +85–115, model rain +6–10h and +11–16h |
| drizzle-only      | sub-threshold noise everywhere |
| gap-in-shower     | one 5-min dry point inside a shower (gap < mergeGap → one event) |
| radar-missing     | HARMONIE only — tests single-source degradation path |
| harmonie-missing  | radar only — timeline ends at +120 min |

These are synthetic domain fixtures. Real trimmed KNMI files (HDF5/NetCDF
subsets) are added in stories 8/11 (decoder integration tests).
