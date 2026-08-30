import type { Confidence } from "@rainwatch/domain";
import type { HorizonSummary, RainEvent, RainForecastSnapshot } from "@rainwatch/forecast-contract";
import { useMemo, useState } from "preact/hooks";

import { type HeroState, heroCopy, heroState, INTENSITY_LABEL } from "./hero.js";
import { useSnapshot } from "./state.js";
import { formatDuration, formatTime, formatTimeRange } from "./time.js";

// One screen (SPEC §29), one visualization, four temporal zoom levels (SPEC §31).

type Horizon = "1h" | "4h" | "12h" | "24h";

const HORIZONS: readonly Horizon[] = ["1h", "4h", "12h", "24h"];

const HORIZON_HOURS: Record<Horizon, number> = {
  "1h": 1,
  "4h": 4,
  "12h": 12,
  "24h": 24,
};

const HORIZON_SUMMARY_KEY: Record<Horizon, keyof RainForecastSnapshot["horizons"]> = {
  "1h": "oneHour",
  "4h": "fourHours",
  "12h": "twelveHours",
  "24h": "twentyFourHours",
};

const STATUS_LABEL: Record<HorizonSummary["status"], string> = {
  dry: "Dry",
  "rain-possible": "Rain possible",
  rain: "Rain",
  showers: "Showers",
  "heavy-rain": "Heavy rain",
};

/** SPEC §32 — confidence shown subtly via opacity. */
const CONFIDENCE_OPACITY: Record<Confidence, number> = {
  high: 1,
  medium: 0.65,
  low: 0.35,
};

const X_LABELS: Record<Horizon, readonly string[]> = {
  "1h": ["now", "+30m", "+1h"],
  "4h": ["now", "+1h", "+2h", "+3h", "+4h"],
  "12h": ["now", "+3h", "+6h", "+9h", "+12h"],
  "24h": ["now", "+6h", "+12h", "+18h", "+24h"],
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

/** SPEC §32 — keep at most `max` bars, sampling evenly (long horizons). */
function decimate<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = Math.ceil(items.length / max);
  return items.filter((_, i) => i % step === 0);
}

/** "just now" | "5 min ago" | "1 h 20 min ago" — relative to `nowEpochMs`. */
function agoLabel(epochMs: number, nowEpochMs: number): string {
  const minutes = Math.max(0, Math.round((nowEpochMs - epochMs) / 60_000));
  if (minutes <= 1) return "just now";
  return `${formatDuration(minutes)} ago`;
}

export function App() {
  const {
    snapshot,
    freshness,
    error,
    offline,
    cachedFromFallback,
    cachedAtEpochMs,
    nowEpochMs,
    reload,
  } = useSnapshot();
  const [horizon, setHorizon] = useState<Horizon>("1h");

  const heroValue: HeroState =
    snapshot !== null ? heroState(snapshot, freshness, nowEpochMs) : "stale";
  const copy = snapshot !== null ? heroCopy(heroValue, snapshot, nowEpochMs) : null;

  const summary = useMemo(() => {
    if (snapshot === null) return null;
    return snapshot.horizons[HORIZON_SUMMARY_KEY[horizon]];
  }, [snapshot, horizon]);

  const timeline = useMemo(() => {
    if (snapshot === null) return null;
    const hours = HORIZON_HOURS[horizon];
    const from = nowEpochMs;
    const until = from + hours * 3_600_000;
    const points = snapshot.timeline.filter((p) => {
      const t = Date.parse(p.timestamp);
      return t >= from && t <= until;
    });
    // SPEC §32 — 5 mm/h scale for 1h/4h; window max otherwise.
    const maxY =
      hours <= 4
        ? 5
        : Math.max(
            points.reduce((m, p) => Math.max(m, p.precipitationMmPerHour), 0),
            1,
          );
    return { bars: decimate(points, hours >= 12 ? 48 : 120), maxY };
  }, [snapshot, horizon, nowEpochMs]);

  const horizonEvents = useMemo<RainEvent[]>(() => {
    if (snapshot === null) return [];
    const hours = HORIZON_HOURS[horizon];
    const until = nowEpochMs + hours * 3_600_000;
    return snapshot.events
      .filter((e) => Date.parse(e.endsAt) > nowEpochMs && Date.parse(e.startsAt) < until)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }, [snapshot, horizon, nowEpochMs]);

  const nextEvent: RainEvent | null = horizonEvents[0] ?? null;
  const laterEvents = horizonEvents.slice(1);

  if (snapshot === null) {
    return (
      <main className="app-shell">
        {error !== null ? (
          <section className="error-state" role="alert">
            <h1>Forecast unavailable</h1>
            <p>{error}</p>
            <button type="button" className="retry-button" onClick={reload}>
              Retry
            </button>
          </section>
        ) : (
          <p className="loading">Loading forecast…</p>
        )}
      </main>
    );
  }

  const showBanner = offline || cachedFromFallback;
  const downloadedAgo =
    cachedAtEpochMs !== null
      ? agoLabel(cachedAtEpochMs, nowEpochMs)
      : agoLabel(Date.parse(snapshot.generatedAt), nowEpochMs);

  return (
    <div className="app-shell">
      {showBanner && (
        <div className="offline-banner" role="status">
          {offline
            ? `Offline — showing forecast downloaded ${downloadedAgo}`
            : `Latest forecast unavailable — showing cached forecast downloaded ${downloadedAgo}`}
        </div>
      )}

      <header className="app-header">
        <h1 className="location">{snapshot.location.label}</h1>
        <p className="updated">
          Updated {agoLabel(Date.parse(snapshot.generatedAt), nowEpochMs)}
          {freshness === "degraded" && <span className="badge badge-degraded">Degraded</span>}
          {freshness === "stale" && <span className="badge badge-stale">Out of date</span>}
        </p>
      </header>

      <main className="app-main">
        {copy !== null && (
          <section className="hero" data-state={heroValue}>
            <h2 className="hero-headline">{copy.headline}</h2>
            {copy.subline !== "" && <p className="hero-subline">{copy.subline}</p>}
            {nextEvent !== null && (heroValue === "rain-soon" || heroValue === "rain-later") && (
              <p className="hero-peak">Peak {nextEvent.peakMmPerHour.toFixed(1)} mm/h</p>
            )}
          </section>
        )}

        <nav className="horizon-selector" aria-label="Forecast horizon">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              className={
                h === horizon ? "horizon-button horizon-button-selected" : "horizon-button"
              }
              aria-pressed={h === horizon}
              onClick={() => setHorizon(h)}
            >
              {h}
            </button>
          ))}
        </nav>

        {summary !== null && (
          <section className="summary" aria-live="polite">
            <span className="summary-status">{STATUS_LABEL[summary.status]}</span>
            <span className="summary-mm">{summary.accumulatedMm.toFixed(1)} mm</span>
            <span className="summary-peak">peak {summary.maxMmPerHour.toFixed(1)} mm/h</span>
          </section>
        )}

        <section className="timeline-section">
          <h2 className="visually-hidden">Precipitation timeline</h2>
          {timeline !== null && timeline.bars.length > 0 ? (
            <>
              <svg
                className="timeline-svg"
                viewBox="0 0 100 40"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Precipitation over the next ${HORIZON_HOURS[horizon]} hour${HORIZON_HOURS[horizon] === 1 ? "" : "s"}`}
              >
                {timeline.bars.map((p, i) => {
                  const height =
                    (Math.min(p.precipitationMmPerHour, timeline.maxY) / timeline.maxY) * 38;
                  const x = (i / timeline.bars.length) * 100;
                  const width = (100 / timeline.bars.length) * 0.85;
                  return (
                    <rect
                      key={p.timestamp}
                      x={x}
                      y={40 - height}
                      width={width}
                      height={height}
                      rx={0.5}
                      fill={p.precipitationMmPerHour >= 5 ? "#fbbf24" : "#38bdf8"}
                      opacity={CONFIDENCE_OPACITY[p.confidence]}
                    />
                  );
                })}
                <line x1="0" y1="39.5" x2="100" y2="39.5" stroke="#334155" strokeWidth={0.6} />
              </svg>
              <div className="timeline-labels">
                {X_LABELS[horizon].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="timeline-empty">No timeline data for this window</p>
          )}
        </section>

        <section className="events">
          <h2>Next rain</h2>
          {nextEvent !== null ? (
            <div className="event">
              <p className="event-time">{formatTimeRange(nextEvent.startsAt, nextEvent.endsAt)}</p>
              <p className="event-detail">
                {INTENSITY_LABEL[nextEvent.peakIntensity]} · ~
                {formatDuration(nextEvent.durationMinutes)}
              </p>
            </div>
          ) : (
            <p className="event-none">No rain expected in the next {horizon}</p>
          )}
          {laterEvents.length > 0 && (
            <>
              <h2>Later</h2>
              <ul className="later-list">
                {laterEvents.map((e) => (
                  <li key={e.id}>
                    <span className="later-time">{formatTimeRange(e.startsAt, e.endsAt)}</span>
                    <span className="later-detail">
                      {INTENSITY_LABEL[e.peakIntensity]} · ~{formatDuration(e.durationMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <details className="diagnostics">
          <summary>Diagnostics</summary>
          <dl className="diag-grid">
            <div>
              <dt>Schema version</dt>
              <dd>{snapshot.schemaVersion}</dd>
            </div>
            <div>
              <dt>Freshness</dt>
              <dd>{freshness}</dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>{formatTime(snapshot.generatedAt, DATETIME_OPTS)}</dd>
            </div>
            <div>
              <dt>Source data generated</dt>
              <dd>{formatTime(snapshot.sourceGeneratedAt, DATETIME_OPTS)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{formatTime(snapshot.expiresAt, DATETIME_OPTS)}</dd>
            </div>
          </dl>
          <h3>Sources</h3>
          <ul className="source-list">
            {snapshot.sources.map((s) => (
              <li key={`${s.source}-${s.dataset}`}>
                <strong>{s.source}</strong> — {s.dataset}
                {s.datasetVersion !== undefined ? ` v${s.datasetVersion}` : ""}
                <br />
                run {formatTime(s.runGeneratedAt, DATETIME_OPTS)} · fetched{" "}
                {formatTime(s.fetchedAt, DATETIME_OPTS)}
              </li>
            ))}
          </ul>
        </details>
      </main>
    </div>
  );
}
