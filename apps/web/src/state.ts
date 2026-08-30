import type { RainForecastSnapshot } from "@rainwatch/forecast-contract";
import { RAIN_FORECAST_SNAPSHOT_SCHEMA } from "@rainwatch/forecast-contract";
import { useEffect, useState } from "preact/hooks";

export type Freshness = "fresh" | "degraded" | "stale";

const CACHE_KEY = "rainwatch:lastSnapshot";

/** SPEC §25 — fresh < 10 min, degraded 10-20 min, stale > 20 min. */
const FRESH_MS = 10 * 60_000;
const DEGRADED_MS = 20 * 60_000;

interface CachedSnapshotEnvelope {
  cachedAtEpochMs: number;
  snapshot: RainForecastSnapshot;
}

/**
 * SPEC §6.2, §40 — fetch the published snapshot and validate it against the
 * shared contract schema. Throws when the response is missing, non-JSON or
 * schema-invalid.
 */
export async function fetchSnapshot(url = "/forecast.json"): Promise<RainForecastSnapshot> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch forecast (HTTP ${response.status})`);
  }
  const json: unknown = await response.json();
  return RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(json);
}

/** SPEC §25 — classify snapshot age against the generatedAt timestamp. */
export function computeFreshness(snapshot: RainForecastSnapshot, nowEpochMs: number): Freshness {
  const ageMs = nowEpochMs - Date.parse(snapshot.generatedAt);
  if (ageMs < FRESH_MS) return "fresh";
  if (ageMs < DEGRADED_MS) return "degraded";
  return "stale";
}

function writeCache(snapshot: RainForecastSnapshot, cachedAtEpochMs: number): void {
  try {
    const envelope: CachedSnapshotEnvelope = { cachedAtEpochMs, snapshot };
    localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage unavailable (private mode / quota) — the cache is best-effort.
  }
}

function readCache(): CachedSnapshotEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const envelope = parsed as Partial<CachedSnapshotEnvelope>;
    if (typeof envelope.cachedAtEpochMs !== "number" || envelope.snapshot === undefined)
      return null;
    return {
      cachedAtEpochMs: envelope.cachedAtEpochMs,
      snapshot: RAIN_FORECAST_SNAPSHOT_SCHEMA.parse(envelope.snapshot),
    };
  } catch {
    return null;
  }
}

export interface SnapshotState {
  snapshot: RainForecastSnapshot | null;
  freshness: Freshness;
  error: string | null;
  offline: boolean;
  /** True when the displayed snapshot came from the localStorage cache. */
  cachedFromFallback: boolean;
  /** When the displayed snapshot was last fetched successfully (epoch ms). */
  cachedAtEpochMs: number | null;
  /** Ticking "now" for freshness and relative labels; advances every 30 s. */
  nowEpochMs: number;
  reload: () => void;
}

/**
 * SPEC §6.2, §34-35 — load the snapshot once on mount. On fetch failure, fall
 * back to the last good cached snapshot (flagged, never presented as current),
 * or surface an error when no cache exists. No KNMI logic here.
 */
export function useSnapshot(url = "/forecast.json"): SnapshotState {
  const [snapshot, setSnapshot] = useState<RainForecastSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState<boolean>(() => !navigator.onLine);
  const [cachedFromFallback, setCachedFromFallback] = useState(false);
  const [cachedAtEpochMs, setCachedAtEpochMs] = useState<number | null>(null);
  const [nowEpochMs, setNowEpochMs] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const fetched = await fetchSnapshot(url);
        if (cancelled) return;
        const fetchedAt = Date.now();
        writeCache(fetched, fetchedAt);
        setSnapshot(fetched);
        setCachedAtEpochMs(fetchedAt);
        setCachedFromFallback(false);
        setOffline(false);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setOffline(!navigator.onLine);
        const cached = readCache();
        if (cached !== null) {
          // SPEC §35 — show the cached snapshot, but never as current.
          setSnapshot(cached.snapshot);
          setCachedAtEpochMs(cached.cachedAtEpochMs);
          setCachedFromFallback(true);
          setError(null);
        } else {
          setSnapshot(null);
          setCachedFromFallback(false);
          setError(err instanceof Error ? err.message : "Failed to load forecast");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [url, attempt]);

  // Keep "now" (and therefore freshness + relative labels) live.
  useEffect(() => {
    const id = setInterval(() => setNowEpochMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Reflect browser online/offline transitions.
  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const freshness: Freshness = snapshot !== null ? computeFreshness(snapshot, nowEpochMs) : "stale";

  return {
    snapshot,
    freshness,
    error,
    offline,
    cachedFromFallback,
    cachedAtEpochMs,
    nowEpochMs,
    reload: () => setAttempt((n) => n + 1),
  };
}
