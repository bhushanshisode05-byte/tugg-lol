/**
 * Player notification (engagement) email rules. Browser-safe: no secrets, no server imports.
 * The SQL functions engagement_scan / engagement_claim enforce the same numbers; src/test/engagement.sql checks them there.
 */
export type EngagementKind = "overtaken" | "closing_soon" | "round_result";
export const ENGAGEMENT_KINDS: readonly EngagementKind[] = ["overtaken", "closing_soon", "round_result"];

export const ENGAGEMENT_RULES = {
  /** Frequency cap: at most one email of each kind per person, per round, per environment (database unique key). */
  perKindPerRound: 1,
  /** Closing soon is checked only in this final stretch of a round. */
  closingWindowHours: { daily: 2, weekly: 6 } as const,
  /** No closing-soon in the last minutes: there would be no time to act. */
  closingMinLeftMinutes: 5,
  /** Closable gap: behind by at most the larger of $25 or 20% of the leading side's round total. */
  closableFloorCents: 2500,
  closableSharePercent: 20,
  /** Someone who pulled in the last 30 minutes already knows the score: no closing-soon nudge. */
  closingQuietAfterPullMinutes: 30,
  /** No closing-soon within 2 hours of an overtaken email for the same round. */
  closingAfterOvertakenHours: 2,
  /** Across all matchups: at most 4 engagement emails per person per hour and 12 per day. */
  perPersonPerHour: 4,
  perPersonPerDay: 12,
  /** Lead-change news is dropped after 3 hours (or at round end); results after 24 hours. */
  overtakenTtlHours: 3,
  resultTtlHours: 24,
  /** Sending: small batches per scheduled run, two at a time, three attempts at most. */
  batchPerRun: 10,
  concurrency: 2,
  maxAttempts: 3,
} as const;

/** Mirrors SQL engagement_closable(gap, leader). */
export function isClosableGap(gapCents: number, leaderCents: number) {
  return gapCents > 0 && gapCents <= Math.max(ENGAGEMENT_RULES.closableFloorCents, Math.floor((leaderCents * ENGAGEMENT_RULES.closableSharePercent) / 100));
}

/** Shown before purchase (pull panels) and on the receipt. */
export const ENGAGEMENT_DISCLOSURE =
  "We'll email the address you give at checkout about rounds you pull in: when your side loses the lead, when a close round is ending, and the result. One-click unsubscribe in every email; receipts and refund notices still arrive.";
