// What a buyer of a new matchup ($9 / $29) sees after checkout, decided only from the stored order and matchup.
// Browser-safe: the server builds the result with creationResult, the page reads it with the shared poller.
import type { ConfirmPhase } from "./confirmation";

/** waiting: payment or moderation still pending; live/rejected/refunded/failed are final. */
export type CreationOutcome = "waiting" | "live" | "rejected" | "refunded" | "failed";
export type CreationResult = {
  status: CreationOutcome;
  /** The stored order is paid (the outcome may still be pending moderation). */
  paid: boolean;
  /** Moderation could not be reached at least once; checks keep retrying on the payments schedule. */
  delayed: boolean;
  slug: string;
  title: string;
  reason: string | null;
  refunded: boolean;
};

type StoredCreation = {
  status: string;
  refund_status: string | null;
  review_reason: string | null;
  moderation_failures?: number | null | undefined;
  matchups: { slug: string; status: string; title: string } | null;
};

export function creationResult(o: StoredCreation | null | undefined): CreationResult | null {
  if (!o || !o.matchups) return null;
  const m = o.matchups, refunded = o.refund_status === "succeeded";
  const status: CreationOutcome =
    o.status === "failed" || o.status === "expired" ? "failed"
    : m.status === "active" || m.status === "retired" ? "live"
    : m.status === "rejected" ? "rejected"
    : refunded ? "refunded"
    : "waiting";
  return { status, paid: o.status === "paid", delayed: (o.moderation_failures ?? 0) > 0, slug: m.slug, title: m.title, reason: status === "rejected" ? o.review_reason : null, refunded };
}

/** Final outcomes end checking ("paid" here means "the outcome is known"); everything else keeps checking. */
export const creationPhase = (r: CreationResult): ConfirmPhase | null =>
  r.status === "failed" ? "failed" : r.status === "waiting" ? null : "paid";
export const creationConfirmed = (r: CreationResult) => r.paid;

export const CREATION_MESSAGES = {
  checking: "Confirming your payment… This usually takes under a minute. Please don't pay again.",
  moderating: "Payment confirmed. We're checking your matchup against the rules; it goes live as soon as it passes.",
  delayed: "Payment confirmed. Our automatic check is taking longer than usual, so we're retrying. Your matchup goes live as soon as it passes; if it isn't approved, you'll be refunded in full. You don't need to pay again.",
  closed: "Checkout closed. If you paid, we're confirming it now and your matchup will appear here. Please don't pay again.",
  cancelled: "Checkout closed. Nothing was charged. If you did pay, your matchup will appear here in a moment.",
  slow: "Your payment is still being confirmed. If it went through, your matchup will appear here; you don't need to pay again.",
  failed: "No matchup was activated and nothing was applied. You can submit again.",
  refunded: "Your matchup wasn't published and your payment has been refunded in full.",
} as const;

/** The waiting note for a phase that is still checking. */
export function creationWaitingText(phase: ConfirmPhase, r: CreationResult | undefined) {
  if (r?.paid) return r.delayed ? CREATION_MESSAGES.delayed : CREATION_MESSAGES.moderating;
  if (phase === "slow") return CREATION_MESSAGES.slow;
  if (phase === "closed") return CREATION_MESSAGES.closed;
  if (phase === "cancelled") return CREATION_MESSAGES.cancelled;
  return CREATION_MESSAGES.checking;
}
