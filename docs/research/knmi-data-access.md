# KNMI Data Platform — Access, Auth, API

> Research doc — all facts verified against the live API on 2026-08-30 unless marked UNVERIFIED.
> Source: developer.dataplatform.knmi.nl/open-data-api

## API key types

| Key | Rate limit | Quota | Expiry |
|---|---|---|---|
| Registered (recommended) | 200 req/s | 1000 req/h | never |
| Anonymous (shared) | 50 req/min | 3000 req/h (shared) | yearly rotation |
| Dataset bulk | 100 req/s | whole dataset | per-request, email |

- Auth: `Authorization: <key>` header on every call.
- Anonymous access works without a valid key in practice (verified: listing + URL endpoint return 200 with no/truncated key), but KNMI asks for the key and rotates anonymous yearly. **Use a registered key** (free, registered at developer.dataplatform.knmi.nl → API Catalog → "Request an API key").
- License of all datasets used: **CC BY 4.0**. Attribution: KNMI.

## Endpoints

```
List files:    GET https://api.dataplatform.knmi.nl/open-data/v1/datasets/{dataset}/versions/{version}/files
               ?maxKeys=N&sorting=desc&orderBy=lastModified
Download URL:  GET .../files/{filename}/url
               → {"temporaryDownloadUrl": "<S3 presigned URL>", "size": "...", ...}
```

- Presigned S3 URLs expire after **3600 s** — fetch + download immediately.
- `sorting=desc&orderBy=lastModified` = newest first (verified).
- Deprecation notices arrive via `X-KNMI-Deprecation` response header — log it.

## Polling etiquette (important)

- KNMI: "Excessive polling of the Open Data API to check for new files is considered abuse." Use the **Notification Service** (Kafka-based; every dataset page lists it) for push-based discovery — this is the preferred production evolution per SPEC §6.1.
- V1 5-min polling math: per cycle = 2 listings + 2 downloads ≈ 4 requests → ~48 req/h → ~1150/day. Far under the 1000 req/h registered quota (request *rate* is the binding constraint, not the hourly total — 48/h is fine). Acceptable for V1; switch to Notification Service in the operational-hardening phase.

## Dataset versions used

| Purpose | Dataset | Version | Format |
|---|---|---|---|
| 0–2 h nowcast | `radar_forecast` | 2.0 | HDF5 |
| 2–24 h model | `uwcw-ha-det-nl-s1` | 1.0 | NetCDF4 |

Both `onGoing`, both CC BY 4.0.

## Notes

- `harmonie_arome_cy43_p1` v1.0 is now a **historic archive** (starts 2026-01-08, post-UWC-West migration). Current operational NL data = `uwcw-ha-det-nl-s1`. Do not use p1.
- The classic `rad_nl25_rac_mfbs_5min` is a **climatological** dataset (fortnightly, ~1 month delay) — NOT realtime. Do not use.
- Future/V2 pointer: `seamless_precipitation_ensemble_forecast_probabilities` v1.0 — 5-min exceedance probabilities (0.1/0.3/1/3/10/30 mm/h) up to +6 h, PILOT status. This is the natural source for SPEC §55 V2 probabilistic forecasts. UNVERIFIED status/format details.
