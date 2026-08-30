# Roadmap — Rainwatch NL

Phased delivery from SPEC §52-55. Ground truth: `SPEC.md`.

## Phase 1 — Vertical slice (SPEC §52)

- [ ] Hardcoded fixture feeding the domain pipeline
- [ ] Domain pipeline: normalize → fuse → extract → summarize → buildSnapshot
- [ ] `forecast.json` published from the fixture
- [ ] SPA renders the snapshot

**Acceptance:** the SPA correctly visualizes synthetic rain over all four
horizons (1h, 4h, 12h, 24h).

## Phase 2 — KNMI radar (SPEC §52)

- [ ] KNMI API access (dataset ID + auth pattern — decision O1)
- [ ] Radar file ingestion (`client.ts`)
- [ ] Decoder (`decoder.ts`)
- [ ] Coordinate extraction for Amsterdam West (`grid.ts`, nearest cell)
- [ ] 0–2h timeline at 5-minute resolution

**Acceptance:** the SPA displays real Amsterdam West short-term precipitation.

## Phase 3 — HARMONIE (SPEC §52)

- [ ] HARMONIE dataset ingestion
- [ ] Normalization to the canonical timeline (2–24h)

**Acceptance:** a complete 24-hour timeline is available.

## Phase 4 — Fusion (SPEC §52)

- [ ] Overlap blending 90–120 min with the §20 weights
- [ ] Confidence heuristics (§21)
- [ ] Event extraction (§12)
- [ ] Horizon summaries 1h / 4h / 12h / 24h (§13)

**Acceptance:** no visible discontinuity around the radar/model transition.

## Phase 5 — Operational hardening (SPEC §52)

- [ ] Freshness semantics (§25) with visible degraded/stale UI
- [ ] Last-known-good snapshot retention (§35)
- [ ] Source health reporting (`data:doctor`)
- [ ] Diagnostics (`data:inspect`)
- [ ] PWA: add to home screen, standalone display, cached app shell, offline
      last-known snapshot with explicit "Offline" label (§34)
- [ ] CI: install → typecheck → lint → unit → integration → web build → data
      build → Playwright; no KNMI credentials needed for PRs (§47)
- [ ] Deployment: rain-data scheduler + static hosting for web and snapshot
      (§45)

**Acceptance:** all V1 acceptance criteria (below) pass.

## V1 acceptance criteria (SPEC §53)

- [ ] 1. A backend process obtains real KNMI precipitation data for Amsterdam West
- [ ] 2. Short-term radar forecasts cover the next two hours
- [ ] 3. A model forecast extends the timeline through 24 hours
- [ ] 4. Both sources produce one canonical precipitation timeline
- [ ] 5. Rain events are derived automatically
- [ ] 6. Summaries exist for 1h, 4h, 12h and 24h
- [ ] 7. The backend publishes valid `forecast.json`
- [ ] 8. The SPA has no KNMI-specific code
- [ ] 9. The SPA loads comfortably on a phone
- [ ] 10. The user can determine within ~1 second whether rain is imminent
- [ ] 11. Data freshness is clearly visible
- [ ] 12. Stale data can never be mistaken for a current forecast
- [ ] 13. The system continues operating when one upstream source temporarily fails
- [ ] 14. The full domain pipeline can run offline from fixtures
- [ ] 15. Forecast outputs can be replayed for debugging

## First useful release (SPEC §54)

Do not wait for every feature. Ship:

```
rainwatch/

apps/data
├── KNMI radar adapter
├── one Amsterdam West location
├── event extraction
├── 0–2h forecast
└── forecast.json

apps/web
├── mobile PWA
├── rain now
├── rain starts in X minutes
├── next rain event
├── 1h timeline
└── data freshness
```

Then add HARMONIE and the 4h/12h/24h horizons.

## Evolution path (SPEC §55)

Once the basic system is reliable:

**V2 — probabilistic forecasts**
- [ ] Replace heuristic confidence with ensemble precipitation probabilities
- [ ] Expose `P(rain > 0.5 mm/h)` instead of only deterministic precipitation
- [ ] Contract change → `schemaVersion` bump (§40)

**V3 — alerts**
- [ ] Third consumer of the existing contract: `rain-alerts`
- [ ] Rules: rain starts within 30m AND expected intensity > threshold AND
      not already alerted
- [ ] No changes required to ingestion or SPA

**V4 — multiple locations**
- [ ] Locations: home, office, dance studio, current location
- [ ] Publish `/forecast/amsterdam-west.json`, `/forecast/office.json`

**V5 — current-location awareness**
- [ ] Phone sends coarse location; backend evaluates the corresponding
      precipitation grid
- [ ] No long-term precise location storage

**V6 — personalized decision layer**
- [ ] Outputs like "Dry for your 25-minute walk. Leave before 18:20."
- [ ] Stays a consumer of the forecast system — never contaminates the
      meteorological data pipeline

## Evaluation harness (SPEC §42)

- [ ] Capture `ForecastEvaluationRecord` (issuedAt, targetTimestamp,
      predictedMmPerHour, source, observedMmPerHour?) during `data:update`
- [ ] Later: measure rain/no-rain precision and recall, onset timing error,
      intensity error, false alarm rate — used to tune radar/HARMONIE
      blending, spatial aggregation, and rain thresholds
