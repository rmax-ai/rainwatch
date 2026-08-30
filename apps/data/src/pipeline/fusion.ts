import type { ForecastPoint, SourceForecastPoint } from "@rainwatch/domain";

import { blendConfidence, calculateConfidence } from "./confidence.js";

export interface FusionWeights {
  /** lead minutes when radar weight starts dropping below 1 (SPEC §20: 90) */
  blendStartMin: number;
  /** lead minutes when the blend ends (SPEC §20: 120) */
  blendEndMin: number;
  /** radar weight at blendStart (SPEC §20 example: 0.75) */
  startRadarWeight: number;
  /** radar weight at blendEnd (SPEC §20 example: 0.25) */
  endRadarWeight: number;
}

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  blendStartMin: 90,
  blendEndMin: 120,
  startRadarWeight: 0.75,
  endRadarWeight: 0.25,
};

export interface FusionInput {
  radar: SourceForecastPoint[];
  harmonie: SourceForecastPoint[];
  nowEpochMs: number;
  weights?: FusionWeights;
}

/**
 * SPEC §20, §27 — pure. Combine radar (0-2h) and HARMONIE (2-24h):
 *   t < 90    → 100% radar
 *   90 ≤ t ≤ 120 → blended, radar weight 0.75 → 0.25 (SPEC example: 90→0.75, 105→0.5, 120→0.25)
 *   t > 120   → 100% HARMONIE
 * Missing radar → HARMONIE-only; missing HARMONIE → radar-only (t ≤ 120, nothing beyond).
 */
export function fuseForecasts(input: FusionInput): ForecastPoint[] {
  const { nowEpochMs } = input;
  const w = input.weights ?? DEFAULT_FUSION_WEIGHTS;

  const radar = toIndexed(input.radar, nowEpochMs);
  const harmonie = toIndexed(input.harmonie, nowEpochMs);

  if (radar.length === 0) {
    return harmonie.map((h) => pointAt(h.ms, h.value, "harmonie", h.leadMin));
  }
  if (harmonie.length === 0) {
    return radar
      .filter((r) => r.leadMin <= w.blendEndMin)
      .map((r) => pointAt(r.ms, r.value, "radar-nowcast", r.leadMin));
  }

  const out: ForecastPoint[] = [];
  for (const r of radar) {
    if (r.leadMin < w.blendStartMin) {
      out.push(pointAt(r.ms, r.value, "radar-nowcast", r.leadMin));
      continue;
    }
    if (r.leadMin > w.blendEndMin) continue; // HARMONIE takes over strictly after blendEnd
    const h = nearest(harmonie, r.leadMin);
    if (h === null) {
      // No HARMONIE near this lead time — carry radar forward.
      out.push(pointAt(r.ms, r.value, "radar-nowcast", r.leadMin));
      continue;
    }
    const radarWeight = radarWeightAt(r.leadMin, w);
    const value = r.value * radarWeight + h.value * (1 - radarWeight);
    const conf = blendConfidence(
      calculateConfidence("radar-nowcast", r.leadMin),
      calculateConfidence("harmonie", h.leadMin),
    );
    out.push({
      timestamp: new Date(r.ms).toISOString(),
      precipitationMmPerHour: value,
      source: "blended",
      confidence: conf,
    });
  }
  for (const h of harmonie) {
    if (h.leadMin > w.blendEndMin) {
      out.push(pointAt(h.ms, h.value, "harmonie", h.leadMin));
    }
  }
  out.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return out;
}

function radarWeightAt(leadMin: number, w: FusionWeights): number {
  const span = w.blendEndMin - w.blendStartMin;
  if (span <= 0) return w.endRadarWeight;
  const f = (leadMin - w.blendStartMin) / span;
  return w.startRadarWeight + (w.endRadarWeight - w.startRadarWeight) * f;
}

interface IndexedPoint {
  ms: number;
  value: number;
  leadMin: number;
}

function toIndexed(points: SourceForecastPoint[], nowEpochMs: number): IndexedPoint[] {
  const out: IndexedPoint[] = [];
  for (const p of points) {
    const ms = Date.parse(p.timestamp);
    if (!Number.isFinite(ms)) continue;
    out.push({ ms, value: p.precipitationMmPerHour, leadMin: (ms - nowEpochMs) / 60_000 });
  }
  out.sort((a, b) => a.ms - b.ms);
  return out;
}

function nearest(points: IndexedPoint[], leadMin: number): IndexedPoint | null {
  let best: IndexedPoint | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const d = Math.abs(p.leadMin - leadMin);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function pointAt(
  ms: number,
  value: number,
  source: ForecastPoint["source"],
  leadMin: number,
): ForecastPoint {
  return {
    timestamp: new Date(ms).toISOString(),
    precipitationMmPerHour: value,
    source,
    confidence: source === "blended" ? "medium" : calculateConfidence(source, leadMin),
  };
}
