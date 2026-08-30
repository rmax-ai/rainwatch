import type { SourceForecastPoint } from "@rainwatch/domain";

const FIVE_MIN_MS = 5 * 60_000;
const HALF_HOUR_MS = 30 * 60_000;
const FOUR_HOURS_MS = 4 * 3_600_000;
const ONE_DAY_MS = 24 * 3_600_000;

/**
 * SPEC §19, §27 — pure. Normalize the published timeline to one resolution:
 * 5-minute steps for [now, now+4h], 30-minute steps for (now+4h, now+24h].
 *
 * Assignment: source point → NEAREST slot; colliding points are averaged;
 * interior empty slots are linearly interpolated between neighbors;
 * edge slots clamp to the nearest available value.
 */
export function resampleTimeline(
  points: SourceForecastPoint[],
  nowEpochMs: number,
): SourceForecastPoint[] {
  // Build the target grid: 5-min slots [now, now+4h) = 48 slots;
  // 30-min slots [now+4h, now+24h] = 41 slots. Total 89.
  const slotMs: number[] = [];
  for (let t = nowEpochMs; t < nowEpochMs + FOUR_HOURS_MS; t += FIVE_MIN_MS) slotMs.push(t);
  for (let t = nowEpochMs + FOUR_HOURS_MS; t <= nowEpochMs + ONE_DAY_MS; t += HALF_HOUR_MS) {
    slotMs.push(t);
  }

  // Assign each in-range source point to its nearest slot.
  const sums = new Map<number, { total: number; count: number }>();
  for (const p of points) {
    const ms = Date.parse(p.timestamp);
    if (!Number.isFinite(ms) || ms < nowEpochMs || ms > nowEpochMs + ONE_DAY_MS) continue;
    // Nearest slot via binary search over the sorted grid.
    const idx = nearestIndex(slotMs, ms);
    const slot = slotMs[idx];
    if (slot === undefined) continue;
    const acc = sums.get(slot) ?? { total: 0, count: 0 };
    acc.total += p.precipitationMmPerHour;
    acc.count += 1;
    sums.set(slot, acc);
  }

  // Assemble per-slot values (null = empty slot).
  const raw = slotMs.map((ms) => {
    const acc = sums.get(ms);
    return acc ? acc.total / acc.count : null;
  });

  const values = interpolate(raw);

  return slotMs.map((ms, i) => ({
    timestamp: new Date(ms).toISOString(),
    precipitationMmPerHour: values[i] ?? 0,
  }));
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

/** Fill nulls: interior → linear interpolation; edges → clamp. */
function interpolate(values: Array<number | null>): Array<number | null> {
  const out = [...values];
  const n = out.length;
  // First pass: fill runs of nulls between known values.
  let i = 0;
  while (i < n) {
    if (out[i] !== null) {
      i += 1;
      continue;
    }
    // find left neighbor
    let leftIdx = i - 1;
    while (leftIdx >= 0 && out[leftIdx] === null) leftIdx -= 1;
    let j = i;
    while (j < n && out[j] === null) j += 1;
    const left = leftIdx >= 0 ? (out[leftIdx] ?? null) : null;
    const right = j < n ? (out[j] ?? null) : null;
    if (left !== null && right !== null) {
      const span = j - leftIdx;
      for (let k = i; k < j; k += 1) {
        out[k] = left + ((right - left) * (k - leftIdx)) / span;
      }
    } else if (left !== null) {
      for (let k = i; k < j; k += 1) out[k] = left;
    } else if (right !== null) {
      for (let k = i; k < j; k += 1) out[k] = right;
    }
    i = j;
  }
  return out;
}
