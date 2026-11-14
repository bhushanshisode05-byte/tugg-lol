// Post-payment confirmation: browser-side checking of a stored order until it reaches a real end state.
// Browser callbacks (Dodo overlay, PayGlocal drawer) only prompt an earlier check; they never decide the outcome.
import type { Side } from "@/lib/tugg.functions";
import type { RoundLength } from "@/lib/rounds";

/** `pull` is the public pull id plus the round totals right after it, for the personal share card. */
export type ReceiptPull = { id: string; totalA: number; totalB: number };
/** `roundLength` is display-only: it words the round ("today's" or "this week's"). */
export type ReceiptLine = { matchupId: string; slug: string; title: string; sides: Side[]; sideId: string; pulls: number; totalA: number; totalB: number; pull?: ReceiptPull | null | undefined; roundLength?: RoundLength | undefined };
export type PaymentReceipt = { amountCents: number; pulls: number; refundedPulls: number; lines: ReceiptLine[]; siteUrl: string };
export type PaymentResult = { status: string; quantity: number; refundedPulls: number; receipt?: PaymentReceipt | null | undefined };

/** idle: nothing to track; checking: waiting for confirmation; closed: checkout window closed, still checking;
 *  slow: stopped checking without an answer (calm, never an error); the rest are end states. */
export type ConfirmPhase = "idle" | "checking" | "closed" | "slow" | "paid" | "failed" | "review";
export type ConfirmState = { phase: ConfirmPhase; result?: PaymentResult | undefined };
export type ConfirmSignal = "closed" | "status" | "completed" | "failed";

/** Gradual backoff: 1s, 1.15s, 1.3s … capped at 4s for the first 3 minutes after tracking starts (when almost every
 *  confirmation lands), then capped at 15s, for 10 minutes before showing the calm "still confirming" note. */
export const CONFIRM_SCHEDULE = { firstMs: 1000, factor: 1.15, earlyMaxMs: 4000, earlyWindowMs: 3 * 60 * 1000, maxMs: 15000, giveUpMs: 10 * 60 * 1000 } as const;
type DelaySchedule = { firstMs: number; factor: number; earlyMaxMs: number; earlyWindowMs: number; maxMs: number };
/** Gap before the next check: `attempt` counts checks since the last backoff reset, `elapsedMs` is time since tracking started. */
export const confirmDelay = (attempt: number, elapsedMs = 0, s: DelaySchedule = CONFIRM_SCHEDULE) =>
  Math.min(elapsedMs < s.earlyWindowMs ? s.earlyMaxMs : s.maxMs, Math.round(s.firstMs * s.factor ** Math.max(0, attempt)));

const END: Record<string, ConfirmPhase> = { paid: "paid", refunded: "paid", failed: "failed", expired: "failed", needs_review: "review" };
/** Only these stored statuses end checking. Anything else, a missing order or a network error means "still confirming". */
export const phaseForStatus = (status: string | undefined | null): ConfirmPhase | null => (status ? END[status] ?? null : null);
export const isEndPhase = (p: ConfirmPhase) => p === "paid" || p === "failed" || p === "review";

export const CONFIRM_MESSAGES = {
  checking: "Confirming your payment… This usually takes under a minute. Please don't pay again.",
  closed: "Checkout closed. If you paid, we're confirming it now and your pulls will appear here. Please don't pay again.",
  slow: "Your payment is still being confirmed. If it went through, your pulls will appear on the rope shortly — you don't need to pay again.",
  failed: "Payment failed or expired. No pulls were applied.",
  review: "Your payment is being reviewed. No pulls have been applied yet; please do not pay again.",
} as const;

type Timer = ReturnType<typeof setTimeout>;
export function createConfirmationPoller(opts: {
  read: (orderId: string) => Promise<PaymentResult | null | undefined>;
  onChange: (state: ConfirmState) => void;
  schedule?: typeof CONFIRM_SCHEDULE;
  now?: () => number;
}) {
  const schedule = opts.schedule ?? CONFIRM_SCHEDULE, now = opts.now ?? (() => Date.now());
  let state: ConfirmState = { phase: "idle" }, orderId = "", attempt = 0, started = 0, closed = false;
  let timer: Timer | undefined, inflight = false, again = false, generation = 0, stopped = false;
  const set = (next: ConfirmState) => { state = next; opts.onChange(next); };
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const waiting = (): ConfirmPhase => (closed ? "closed" : "checking");
  async function check(): Promise<void> {
    if (stopped || !orderId || isEndPhase(state.phase)) return;
    if (inflight) { again = true; return; }
    clear(); inflight = true; again = false;
    const gen = generation;
    let result: PaymentResult | null | undefined = null;
    try { result = await opts.read(orderId); } catch { result = null; /* A failed check is not a failed payment. */ }
    inflight = false;
    if (stopped || gen !== generation) return;
    const end = phaseForStatus(result?.status);
    if (end && result) { clear(); set({ phase: end, result }); return; }
    if (again) { void check(); return; }
    if (now() - started >= schedule.giveUpMs) { set({ phase: "slow", result: result ?? undefined }); return; }
    if (state.phase !== waiting()) set({ phase: waiting(), result: result ?? undefined });
    timer = setTimeout(() => void check(), confirmDelay(attempt++, now() - started, schedule));
  }
  return {
    get state() { return state; },
    /** Start (or restart) tracking an order. The same order keeps its end state. */
    track(id: string) {
      if (!id || (id === orderId && state.phase !== "idle")) return;
      generation++; clear(); orderId = id; attempt = 0; started = now(); closed = false; inflight = false;
      set({ phase: "checking" }); void check();
    },
    /** Checkout window hints: check sooner, adjust the waiting note, never undo an end state. */
    signal(kind: ConfirmSignal) {
      if (!orderId || isEndPhase(state.phase)) return;
      if (kind === "closed") closed = true;
      if (kind === "completed" || kind === "status") closed = false;
      // Any hint restarts the short gaps; only resuming from "slow" restarts the 10-minute give-up deadline.
      attempt = 0;
      if (state.phase === "slow") started = now();
      if (state.phase !== "slow" && state.phase !== waiting()) set({ phase: waiting(), result: state.result });
      void check();
    },
    /** Resume after the calm "still confirming" note or when the tab becomes visible again. */
    checkAgain() {
      if (!orderId || isEndPhase(state.phase)) return;
      attempt = 0;
      if (state.phase === "slow") { started = now(); set({ phase: waiting(), result: state.result }); }
      void check();
    },
    stop() { stopped = true; clear(); },
  };
}

/** Rope position before this payment, for the receipt animation (never below zero). */
export function totalsBefore(line: ReceiptLine) {
  const cents = line.pulls * 100, a = line.sides[0]?.id === line.sideId;
  return { a: Math.max(0, line.totalA - (a ? cents : 0)), b: Math.max(0, line.totalB - (a ? 0 : cents)) };
}
