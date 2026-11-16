/**
 * Browser-safe round-length wording. Each round stores the length it was opened with ("daily" or "weekly"), so every
 * sentence about a round is derived from that round, never hardcoded. Weekly rounds are ISO calendar weeks
 * (Monday 00:00 UTC to the next Monday 00:00 UTC); daily rounds end at the next 00:00 UTC.
 */
export type RoundLength = "daily" | "weekly";
/**
 * Parses a stored rounds.round_length (NOT NULL, CHECK daily|weekly; rounds from before lengths existed were daily).
 * Its "daily" fallback is only safe for that column: never use it for a value that can be missing, such as a matchup
 * with no open round. Use the value itself (or null) and let the wording helpers stay neutral.
 */
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

/**
 * Wording helpers below take the round's own length. `null`/`undefined` means "not known" (for example a matchup with
 * no open round): the wording is then neutral and never guesses "today" or "this week".
 */
type KnownLength = RoundLength | null | undefined;

/** "this week's round" / "today's round" / "the current round". */
export const currentRound = (length: KnownLength) =>
  length === "weekly" ? "this week's round" : length === "daily" ? "today's round" : "the current round";
/** "This week's round" / "Today's round" / "The current round". */
export const CurrentRound = (length: KnownLength) =>
  length === "weekly" ? "This week's round" : length === "daily" ? "Today's round" : "The current round";
/** When a round of this length ends. */
export const roundEnds = (length: KnownLength) =>
  length === "weekly" ? "Rounds end Monday 00:00 UTC" : length === "daily" ? "Rounds end at 00:00 UTC" : "Rounds end Monday 00:00 UTC (weekly) or 00:00 UTC (daily)";
/** "this week" / "today" / "this round". */
export const roundPeriod = (length: KnownLength) => (length === "weekly" ? "this week" : length === "daily" ? "today" : "this round");
/** Mid-sentence close: "…when the weekly round ends on Monday at 00:00 UTC". */
export const roundCloses = (length: KnownLength) =>
  length === "weekly"
    ? "weekly round ends on Monday at 00:00 UTC"
    : length === "daily"
      ? "daily round ends at 00:00 UTC"
      : "round ends (Monday 00:00 UTC for weekly rounds, 00:00 UTC for daily ones)";
/** "12 pullers this week" / "1 puller today" / "No pulls yet this week". */
export const pullersText = (length: KnownLength, pullers: number) =>
  pullers > 0 ? `${pullers} puller${pullers === 1 ? "" : "s"} ${roundPeriod(length)}` : `No pulls yet ${roundPeriod(length)}`;

/**
 * Money in the rounds that are open right now, worded from those rounds' own lengths: "this week" when every open
 * round is weekly, "today" when every one is daily, "in current rounds" when they differ. Null with no open rounds.
 */
export function openRoundsPulled(rounds: { round_length: RoundLength; total_a_cents: number; total_b_cents: number }[]) {
  if (!rounds.length) return null;
  const cents = rounds.reduce((n, r) => n + r.total_a_cents + r.total_b_cents, 0);
  const weekly = rounds.filter((r) => r.round_length === "weekly").length;
  const period = weekly === rounds.length ? roundPeriod("weekly") : weekly === 0 ? roundPeriod("daily") : "in current rounds";
  return { cents, period };
}

/** Site-wide cadence sentence from the lengths of the rounds that are open right now. */
export function cadenceSummary(lengths: RoundLength[]) {
  const weekly = lengths.filter((l) => l === "weekly").length;
  if (!lengths.length || weekly === lengths.length) return weekly ? "Weekly rounds end Monday 00:00 UTC." : ROUND_LENGTH_SHORT;
  if (weekly === 0) return "Rounds end daily at 00:00 UTC.";
  return "Most rounds run for a week and end Monday 00:00 UTC; busy ropes reset daily at 00:00 UTC.";
}

/** Policy wording that is true for every matchup, whichever length it is set to. */
export const ROUND_LENGTH_RULE =
  "Each matchup runs in rounds that last either one calendar week, ending Monday 00:00 UTC, or one day, ending at 00:00 UTC. Every matchup page shows its round length, and a live countdown to the close during the round's final hours.";
export const ROUND_LENGTH_SHORT = "Rounds end Monday 00:00 UTC (weekly) or 00:00 UTC (daily ropes).";
export const ALL_TIME_RULE = "Each side's all-time total and round wins never reset: every dollar ever pulled stays counted after a round ends.";
