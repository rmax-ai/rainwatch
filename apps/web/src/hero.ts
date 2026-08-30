import type { RainIntensity } from "@rainwatch/domain";
import type { RainEvent, RainForecastSnapshot } from "@rainwatch/forecast-contract";

import type { Freshness } from "./state.js";
import { formatDuration } from "./time.js";

// SPEC §30 — the single primary signal shown in the hero block.
// Pure state machine: no DOM, no network, deterministic given a fixed "now".

export type HeroState = "dry" | "rain-later" | "rain-soon" | "raining" | "heavy-rain" | "stale";

/** SPEC §30 — rain starting within this many minutes counts as "soon". */
export const RAIN_SOON_MINUTES = 30;

export const INTENSITY_LABEL: Record<RainIntensity, string> = {
  none: "None",
  drizzle: "Drizzle",
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
  "very-heavy": "Very heavy",
};

export interface HeroCopy {
  headline: string;
  subline: string;
}

/**
 * SPEC §30, §25 — decide the hero state from the snapshot and its freshness.
 * `nowEpochMs` is optional (defaults to the wall clock) so tests can pin it.
 */
export function heroState(
  snapshot: RainForecastSnapshot,
  freshness: Freshness,
  nowEpochMs: number = Date.now(),
): HeroState {
  // SPEC §25 — never present stale data as current.
  if (freshness === "stale") return "stale";

  if (snapshot.current.raining) {
    const intensity = snapshot.current.intensity;
    return intensity === "heavy" || intensity === "very-heavy" ? "heavy-rain" : "raining";
  }

  const nextRain = snapshot.nextRain;
  if (nextRain !== null) {
    const minutesUntil = (Date.parse(nextRain.startsAt) - nowEpochMs) / 60_000;
    return minutesUntil <= RAIN_SOON_MINUTES ? "rain-soon" : "rain-later";
  }

  // SPEC §30 — the dry distinction comes from the one-hour horizon.
  if (!snapshot.horizons.oneHour.rainExpected) return "dry";
  return "rain-later";
}

/** Terse hero copy derived from snapshot fields only (SPEC §30). */
export function heroCopy(
  state: HeroState,
  snapshot: RainForecastSnapshot,
  nowEpochMs: number = Date.now(),
): HeroCopy {
  switch (state) {
    case "dry":
      return { headline: "DRY FOR THE NEXT HOUR", subline: "No rain expected in the next hour" };
    case "stale":
      return { headline: "FORECAST OUT OF DATE", subline: "Showing the last received forecast" };
    case "rain-soon":
    case "rain-later":
      return nextRainCopy(state, snapshot, nowEpochMs);
    case "raining":
    case "heavy-rain":
      return activeRainCopy(state, snapshot, nowEpochMs);
  }
}

function nextRainCopy(
  state: "rain-soon" | "rain-later",
  snapshot: RainForecastSnapshot,
  nowEpochMs: number,
): HeroCopy {
  const nextRain = snapshot.nextRain;
  if (nextRain === null) {
    return { headline: "RAIN EXPECTED", subline: "Rain possible in the next hour" };
  }
  const minutesUntil = Math.max(
    0,
    Math.round((Date.parse(nextRain.startsAt) - nowEpochMs) / 60_000),
  );
  const headline =
    state === "rain-soon" && minutesUntil > 1
      ? `RAIN IN ~${minutesUntil} MIN`
      : "RAIN STARTING SOON";
  return { headline, subline: eventSubline(nextRain) };
}

function activeRainCopy(
  state: "raining" | "heavy-rain",
  snapshot: RainForecastSnapshot,
  nowEpochMs: number,
): HeroCopy {
  const ongoing = findOngoingEvent(snapshot, nowEpochMs);
  const intensity = ongoing !== null ? ongoing.peakIntensity : snapshot.current.intensity;
  const durationMinutes = ongoing !== null ? ongoing.durationMinutes : undefined;
  const headline = state === "heavy-rain" ? "HEAVY RAIN" : "RAINING NOW";
  const duration = durationMinutes === undefined ? "" : ` · ~${formatDuration(durationMinutes)}`;
  return { headline, subline: `${INTENSITY_LABEL[intensity]}${duration}` };
}

function eventSubline(event: RainEvent): string {
  return `${INTENSITY_LABEL[event.peakIntensity]} · ~${formatDuration(event.durationMinutes)}`;
}

/** The event covering `nowEpochMs`, if any (SPEC §12 events, not raw points). */
function findOngoingEvent(snapshot: RainForecastSnapshot, nowEpochMs: number): RainEvent | null {
  const ongoing = snapshot.events.find(
    (e) => Date.parse(e.startsAt) <= nowEpochMs && Date.parse(e.endsAt) > nowEpochMs,
  );
  if (ongoing !== undefined) return ongoing;
  const nextRain = snapshot.nextRain;
  if (nextRain !== null && Date.parse(nextRain.startsAt) <= nowEpochMs) return nextRain;
  return null;
}
