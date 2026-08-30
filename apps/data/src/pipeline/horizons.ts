import type { ForecastPoint, RainIntensityThresholds } from "@rainwatch/domain";
import {
  type Confidence,
  classifyIntensity,
  DEFAULT_INTENSITY_THRESHOLDS,
} from "@rainwatch/domain";
import type { HorizonSummary } from "@rainwatch/forecast-contract";

import { calculateAccumulation } from "./accumulation.js";

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** mm/h floor for "rain expected" — matches the drizzle threshold (SPEC §9). */
const RAIN_FLOOR_MM_PER_HOUR = 0.1;

export interface HorizonConfig {
  intensityThresholds: RainIntensityThresholds;
}

/**
 * SPEC §13, §27 — pure. Summarize the window [from, until) into one HorizonSummary.
 * The frontend never recomputes these (SPEC §13).
 */
export function summarizeHorizon(
  points: ForecastPoint[],
  fromEpochMs: number,
  untilEpochMs: number,
  cfg: HorizonConfig = { intensityThresholds: DEFAULT_INTENSITY_THRESHOLDS },
): HorizonSummary {
  const window = points
    .filter((p) => {
      const ms = Date.parse(p.timestamp);
      return Number.isFinite(ms) && ms >= fromEpochMs && ms < untilEpochMs;
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const wet = window.filter((p) => p.precipitationMmPerHour >= RAIN_FLOOR_MM_PER_HOUR);
  const rainExpected = wet.length > 0;

  const accumulatedMm = calculateAccumulation(window, fromEpochMs, untilEpochMs);

  let maxMmPerHour = 0;
  let mean = 0;
  let lowest: Confidence = "high";
  for (const p of window) {
    if (p.precipitationMmPerHour > maxMmPerHour) maxMmPerHour = p.precipitationMmPerHour;
    mean += p.precipitationMmPerHour;
    if (CONF_RANK[p.confidence] < CONF_RANK[lowest]) lowest = p.confidence;
  }
  if (window.length > 0) mean /= window.length;

  const firstRainAt = wet.length > 0 ? new Date(Date.parse(wet[0]!.timestamp)).toISOString() : null;

  // Rain duration: Σ wet-point steps (median gap of wet points).
  const stepMin =
    wet.length > 1 ? medianGapMinutes(wet) : window.length > 1 ? medianGapMinutes(window) : 5;
  const rainDurationMinutes = Math.round(wet.length * stepMin);

  const status = horizonStatus({
    rainExpected,
    confidence: lowest,
    maxMmPerHour,
    windowMinutes: (untilEpochMs - fromEpochMs) / 60_000,
    rainDurationMinutes,
    thresholds: cfg.intensityThresholds,
  });

  return {
    from: new Date(fromEpochMs).toISOString(),
    until: new Date(untilEpochMs).toISOString(),
    status,
    rainExpected,
    accumulatedMm: round3(accumulatedMm),
    maxMmPerHour: round3(maxMmPerHour),
    dominantIntensity: classifyIntensity(mean, cfg.intensityThresholds),
    firstRainAt,
    rainDurationMinutes,
    confidence: lowest,
  };
}

function horizonStatus(input: {
  rainExpected: boolean;
  confidence: Confidence;
  maxMmPerHour: number;
  windowMinutes: number;
  rainDurationMinutes: number;
  thresholds: RainIntensityThresholds;
}): HorizonSummary["status"] {
  if (!input.rainExpected) return "dry";
  if (input.confidence === "low") return "rain-possible";
  if (input.maxMmPerHour >= input.thresholds.heavyMin) return "heavy-rain";
  if (input.rainDurationMinutes <= input.windowMinutes * 0.5) return "showers";
  return "rain";
}

function medianGapMinutes(points: ForecastPoint[]): number {
  const gaps = points
    .slice(1)
    .map((p, i) => (Date.parse(p.timestamp) - Date.parse(points[i]!.timestamp)) / 60_000)
    .filter((g) => g > 0)
    .sort((a, b) => a - b);
  if (gaps.length === 0) return 5;
  return gaps[Math.floor(gaps.length / 2)] ?? 5;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
