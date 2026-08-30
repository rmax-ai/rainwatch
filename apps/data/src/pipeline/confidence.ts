import type { SourceForecastPoint } from "@rainwatch/domain";

/**
 * SPEC §21 — deterministic confidence heuristics.
 * leadMinutes = minutes ahead of "now".
 */
export type Confidence = "high" | "medium" | "low";

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function calculateConfidence(
  source: "radar-nowcast" | "harmonie",
  leadMinutes: number,
): Confidence {
  if (source === "radar-nowcast") {
    return leadMinutes <= 60 ? "high" : "medium";
  }
  return leadMinutes <= 720 ? "medium" : "low";
}

/** Blended points inherit the LOWER of the two contributing confidences (SPEC §21). */
export function blendConfidence(a: Confidence, b: Confidence): Confidence {
  return RANK[a] <= RANK[b] ? a : b;
}
