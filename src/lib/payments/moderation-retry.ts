// A paid matchup whose moderation could not be reached stays unpublished and unrefunded; the 5-minute payments
// schedule (dodo_reconcile_due) re-runs moderation on its age backoff for 24 hours. Once both limits below are
// passed the owner is alerted once and decides; the buyer is never rejected for our outage.
export const MODERATION_RETRY = { alertAfterFailures: 6, alertAfterMs: 3 * 60 * 60 * 1000 } as const;

/** Sustained failure: several unavailable attempts spread over a few hours. */
export function moderationNeedsOwner(failures: number, firstFailedAt: string | null | undefined, now = Date.now()) {
  if (failures < MODERATION_RETRY.alertAfterFailures || !firstFailedAt) return false;
  const first = Date.parse(firstFailedAt);
  return Number.isFinite(first) && now - first >= MODERATION_RETRY.alertAfterMs;
}
