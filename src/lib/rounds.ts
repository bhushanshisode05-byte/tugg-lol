/**
 * Browser-safe round-length wording. Each round stores the length it was opened with ("daily" or "weekly"), so every
 * sentence about a round is derived from that round, never hardcoded. Weekly rounds are ISO calendar weeks
 * (Monday 00:00 UTC to the next Monday 00:00 UTC); daily rounds end at the next 00:00 UTC.
 */
export type RoundLength = "daily" | "weekly";
export const roundLengthOf = (v: unknown): RoundLength => (v === "weekly" ? "weekly" : "daily");

/** Monday (YYYY-MM-DD, UTC) of the calendar week containing the instant. */
export function weekStart(iso: string) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

const fmt = (day: string, year = true) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

/** A round's name: "Week of Nov 9, 2026" for weekly rounds, the UTC day for daily rounds. */
export function roundName(length: RoundLength, startsAt: string) {
  return length === "weekly" ? `Week of ${fmt(weekStart(startsAt))}` : fmt(startsAt.slice(0, 10));
}

/** Name of a closed round as used in history lists (daily rounds keep their close date, as before). */
export function closedRoundName(length: RoundLength, startsAt: string, endsAt: string) {
  return length === "weekly" ? roundName("weekly", startsAt) : new Date(endsAt).toISOString().slice(0, 10);
}

/** "this week's round" / "today's round". */
export const currentRound = (length: RoundLength) => (length === "weekly" ? "this week's round" : "today's round");
/** "This week's round" / "Today's round". */
export const CurrentRound = (length: RoundLength) => (length === "weekly" ? "This week's round" : "Today's round");
/** When a round of this length ends. */
export const roundEnds = (length: RoundLength) => (length === "weekly" ? "Rounds end Monday 00:00 UTC" : "Rounds end at 00:00 UTC");
/** "this week" / "today". */
export const roundPeriod = (length: RoundLength) => (length === "weekly" ? "this week" : "today");

/** Site-wide cadence sentence from the lengths of the rounds that are open right now. */
export function cadenceSummary(lengths: RoundLength[]) {
  const weekly = lengths.filter((l) => l === "weekly").length;
  if (!lengths.length || weekly === lengths.length) return weekly ? "Weekly rounds end Monday 00:00 UTC." : ROUND_LENGTH_SHORT;
  if (weekly === 0) return "Rounds end daily at 00:00 UTC.";
  return "Most rounds run for a week and end Monday 00:00 UTC; busy ropes reset daily at 00:00 UTC.";
}

/** Policy wording that is true for every matchup, whichever length it is set to. */
export const ROUND_LENGTH_RULE =
  "Each matchup runs in rounds that last either one calendar week, ending Monday 00:00 UTC, or one day, ending at 00:00 UTC. Every matchup page shows its round length and exactly when the current round ends.";
export const ROUND_LENGTH_SHORT = "Rounds end Monday 00:00 UTC (weekly) or 00:00 UTC (daily ropes).";
export const ALL_TIME_RULE = "Each side's all-time total and round wins never reset: every dollar ever pulled stays counted after a round ends.";
