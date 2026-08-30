// UI time formatting. Europe/Amsterdam is the ONLY place user-facing times are
// rendered (SPEC §7, §49); internally everything stays UTC ISO strings.
// Pure functions, no DOM — unit-testable.

export const HOUR_MINUTE: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

/** Format an ISO timestamp as Europe/Amsterdam wall time. */
export function formatTime(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", ...opts }).format(
    new Date(iso),
  );
}

/** "16:25–17:15" — Europe/Amsterdam wall time range (SPEC §29). */
export function formatTimeRange(fromIso: string, toIso: string): string {
  return `${formatTime(fromIso, HOUR_MINUTE)}–${formatTime(toIso, HOUR_MINUTE)}`;
}

/** Signed minutes from `nowEpochMs` to `iso`; negative = in the past. */
export function relativeMinutes(iso: string, nowEpochMs: number): number {
  return Math.round((Date.parse(iso) - nowEpochMs) / 60_000);
}

/** "35 min" | "1 h" | "1 h 20 min" — human duration, clamped at 0. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
