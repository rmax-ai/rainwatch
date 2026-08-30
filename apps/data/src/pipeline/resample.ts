import type { SourceForecastPoint } from "@rainwatch/domain";

const FIVE_MIN_MS = 5 * 60_000;
const HALF_HOUR_MS = 30 * 60_000;
const FOUR_HOURS_MS = 4 * 3_600_000;
const ONE_DAY_MS = 24 * 3_600_000;

/**
 * SPEC §19, §27 — pure. Normalize the published timeline to one resolution:
 * 5-minute steps for [now, now+4h), 30-minute steps for [now+4h, now+24h].
 *
 * Assignment: source point → NEAREST slot; colliding points are averaged;
 * interior empty slots are linearly interpolated between neighbors;
 * edge slots clamp to the nearest available value.
 *
 * Generic over SourceForecastPoint: extra fields (source, confidence, ...)
 * of each slot come from its nearest assigned source point (the "anchor").
 * Empty input → all-zero grid with source "radar-nowcast", confidence "low".
 */
export function resampleTimeline<T extends SourceForecastPoint>(
  points: T[],
  nowEpochMs: number,
): T[] {
  // Build the target grid: 5-min slots [now, now+4h) = 48 slots;
  // 30-min slots [now+4h, now+24h] = 41 slots. Total 89.
  const slotMs: number[] = [];
  for (let t = nowEpochMs; t < nowEpochMs + FOUR_HOURS_MS; t += FIVE_MIN_MS) slotMs.push(t);
  for (let t = nowEpochMs + FOUR_HOURS_MS; t <= nowEpochMs + ONE_DAY_MS; t += HALF_HOUR_MS) {
    slotMs.push(t);
  }

  // Assign each in-range source point to its nearest slot; track the anchor
  // (nearest assigned point) per slot for extra-field propagation.
  const sums = new Map<number, { total: number; count: number; anchor: T; anchorDist: number }>();
  for (const p of points) {
    const ms = Date.parse(p.timestamp);
    if (!Number.isFinite(ms) || ms < nowEpochMs || ms > nowEpochMs + ONE_DAY_MS) continue;
    const idx = nearestIndex(slotMs, ms);
    const slot = slotMs[idx];
    if (slot === undefined) continue;
    const dist = Math.abs(slot - ms);
    const acc = sums.get(slot) ?? {
      total: 0,
      count: 0,
      anchor: p,
      anchorDist: Number.POSITIVE_INFINITY,
    };
    acc.total += p.precipitationMmPerHour;
    acc.count += 1;
    if (dist < acc.anchorDist) {
      acc.anchor = p;
      acc.anchorDist = dist;
    }
    sums.set(slot, acc);
  }

  // Assemble per-slot values + anchors (null = empty slot).
  const raw = slotMs.map((ms) => {
    const acc = sums.get(ms);
    return acc ? { value: acc.total / acc.count, anchor: acc.anchor } : null;
  });

  const filled = interpolate(raw);

  return slotMs.map((ms, i) => {
    const cell = filled[i];
    if (cell) {
      return {
        ...cell.anchor,
        timestamp: new Date(ms).toISOString(),
        precipitationMmPerHour: cell.value,
      };
    }
    // No source points at all — degrade to an explicit dry grid.
    return {
      ...(emptyAnchor(ms) as unknown as T),
    };
  });
}

function emptyAnchor(ms: number): SourceForecastPoint & {
  source: string;
  confidence: string;
} {
  return {
    timestamp: new Date(ms).toISOString(),
    precipitationMmPerHour: 0,
    source: "radar-nowcast",
    confidence: "low",
  };
}

function nearestIndex(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid];
    if (v === undefined) break;
    if (v < target) lo = mid + 1;
    else hi = mid;
  }
  const loV = sorted[lo];
  const prevV = lo > 0 ? sorted[lo - 1] : undefined;
  if (loV === undefined) return lo - 1;
  if (prevV !== undefined && Math.abs(prevV - target) <= Math.abs(loV - target)) return lo - 1;
  return lo;
}

interface Cell<T> {
  value: number;
  anchor: T;
}

/** Fill nulls: interior → linear interpolation; edges → clamp. */
function interpolate<T>(values: Array<Cell<T> | null>): Array<Cell<T> | null> {
  const out = [...values];
  const n = out.length;
  let i = 0;
  while (i < n) {
    if (out[i] !== null) {
      i += 1;
      continue;
    }
    let leftIdx = i - 1;
    while (leftIdx >= 0 && out[leftIdx] === null) leftIdx -= 1;
    let j = i;
    while (j < n && out[j] === null) j += 1;
    const left = leftIdx >= 0 ? (out[leftIdx] ?? null) : null;
    const right = j < n ? (out[j] ?? null) : null;
    if (left !== null && right !== null) {
      const span = j - leftIdx;
      for (let k = i; k < j; k += 1) {
        const f = (k - leftIdx) / span;
        const anchor = f < 0.5 ? left.anchor : right.anchor;
        out[k] = { value: left.value + (right.value - left.value) * f, anchor };
      }
    } else if (left !== null) {
      for (let k = i; k < j; k += 1) out[k] = { value: left.value, anchor: left.anchor };
    } else if (right !== null) {
      for (let k = i; k < j; k += 1) out[k] = { value: right.value, anchor: right.anchor };
    }
    i = j;
  }
  return out;
}
