# Ingestion Architecture — Decode Strategy & Operational Math

> Evaluates the Node.js decode path for the two verified formats, with real numbers.

## The good news

Both source files are **HDF5-backed**:
- Radar: native KNMI HDF5 (uint16 rasters + string attrs), 410 KB.
- UWCW: NetCDF4, which IS HDF5 with dimension scales, 7.3 MB (precip).

⇒ One decode technology covers both sources. No GRIB needed anymore (the old `harmonie_arome_cy43_p1` GRIB dataset is archived; operational data is NetCDF).

## Decode library evaluation

| Option | Verdict | Notes |
|---|---|---|
| **h5wasm** (npm) | ✅ Recommended | HDF5 reader compiled to WASM; works in Node; reads both KNMI HDF5 and NetCDF4; actively maintained by USN (Silx/HDF5 group). |
| jsfive (npm) | ⚠️ Alternative | Pure-JS HDF5, zero native deps; covers classic HDF5; less battle-tested for NetCDF4 dimension scales. |
| netcdf4js (npm) | ❌ Skip | Native C++ addon — ARM64 build pain, stale. |
| sciwrid-toolkit | ❌ Skip | Not published on npm (git install), heavier surface than needed. |
| vgrib2 / eccodes-ts | ❌ N/A | GRIB only — not needed anymore. |
| Shelling out to Python | ⚠️ Fallback only | Violates the TS-native design; only if h5wasm fails on KNMI NetCDF4. |

## Memory math (machine: 3.7 GiB RAM, 2 cores)

| File | Uncompressed payload | Note |
|---|---|---|
| Radar HDF5 | 25 × 765×700 × uint16 ≈ 27 MB | Read per-image (765×700 ≈ 1 MB each), or whole file — both trivial |
| UWCW precip NetCDF | 60 × 390×390 × float32 ≈ 37 MB | Read only the 60-value slice at the target cell: `var[t, 0, lat_i, lon_i]` |

Peak working set per run < 100 MB. SPEC §16 "don't load entire rasters" is satisfied by slicing; no special streaming machinery needed at these sizes.

## Polling math (5-min V1 schedule)

- Per cycle: 2 list calls + 2 downloads ≈ 4 HTTP requests → ~48 req/h, ~1150/day.
- Well within registered-key limits (1000 req/h is the quota ceiling; 48/h ≪ 1000/h).
- Download volume: radar 410 KB + precip 7.3 MB per 5-min cycle ≈ **36 MB/h ≈ 0.87 GB/day**. The HARMONIE file changes once per hour — **cache by cycle: only download the precip file when a new cycle appears** (saves 7.3 MB × 12/h). Radar must be fetched every cycle.
- With cycle-caching: ~0.12 GB/day effective. Trivial for any VPS.

## V1 decision summary

1. **Radar:** every run — list newest `RAD_NL25_RAC_FM_*.h5`, download, decode, slice (343, 398) for Amsterdam West.
2. **HARMONIE:** only when a new cycle file appears — download precip NetCDF, slice (187, 167), cache key = cycle label.
3. **Decode:** h5wasm. `grid.ts` per adapter computes cell indices from proj4 string (radar) / in-file lat-lon arrays (harmonie).
4. **API key:** registered key required for production; anonymous key (valid to 2027-08-01, rotates yearly) acceptable for dev.
5. **Freshness:** use `runGeneratedAt` from file contents (radar: filename/image datetime; HARMONIE: forecast_reference_time) — never download time (SPEC §49).

## Remaining open questions (flagged, not blocking)

- KNMI Notification Service API shape — needed only for the event-driven evolution (SPEC §6.1), not V1.
- Seamless ensemble probabilities dataset stability — PILOT status; relevant for V2 only.
- h5wasm read of KNMI NetCDF4 dimension scales — verify in Phase 2 (KNMI radar) with a fixture test; fallback = jsfive or per-variable reads.
- Registered-key signup — needs Max's email (me@rmax.io) + developer portal account; do at Phase 2 (radar) when the first live fetch runs.
