/**
 * Browser-safe rules for how loudly a rope talks about its round closing. A round stays calm (its name only) until it
 * is inside its length's urgent window, then shows a live countdown; the final hour is loudest and is the only state
 * that mentions Final-Hour extensions. Tune the thresholds here and nowhere else.
 */
import type { RoundLength } from "./rounds";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Time left below which a round shows its live countdown. A fixed 12 h would be half of a daily round. */
export const URGENT_UNDER_MS: Record<RoundLength, number> = { weekly: 12 * HOUR, daily: 3 * HOUR };
/** Time left at or below which a round is in its final hour (strongest emphasis, extension note). */
export const FINAL_HOUR_MS = HOUR;

export type RoundUrgency = "calm" | "urgent" | "final";

export function roundUrgency(length: RoundLength, endsAt: string, now: number): RoundUrgency {
  const left = Date.parse(endsAt) - now;
  if (left <= FINAL_HOUR_MS) return "final";
  return left < URGENT_UNDER_MS[length] ? "urgent" : "calm";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Ticking duration: "4h 12m 09s", "42m 09s". Rounds down, so it never shows more time than is left. */
export function closesInText(ms: number) {
  const left = Math.max(0, ms);
  const h = Math.floor(left / HOUR), m = Math.floor((left % HOUR) / MINUTE), s = Math.floor((left % MINUTE) / 1000);
  return h ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

/**
 * Coarse, static wording for assistive tech, e.g. "Closes in about 4 hours". It changes at most every five minutes
 * (hourly above one hour), so it never announces a per-second tick.
 */
export function closesInLabel(ms: number) {
  if (ms <= 0) return "Closing now";
  if (ms < MINUTE) return "Closes in less than a minute";
  if (ms < 5 * MINUTE) return "Closes in under 5 minutes";
  const minutes = Math.round(ms / MINUTE / 5) * 5;
  if (minutes < 60) return `Closes in about ${minutes} minutes`;
  const hours = Math.max(1, Math.round(ms / HOUR));
  return `Closes in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** "+20m final hour" when lead-changing pulls extended the round, otherwise null. */
export const extensionNote = (extensions: number) => (extensions > 0 ? `+${extensions * 10}m final hour` : null);
