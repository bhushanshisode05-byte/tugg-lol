import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfirmState } from "@/lib/payments/confirmation";
import { CREATION_MESSAGES, creationWaitingText, type CreationResult } from "@/lib/payments/creation-status";

/** Shown above the form after the checkout window closed with no sign of payment; checking carries on quietly. */
export function CreationCancelledNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mx-auto mt-6 flex max-w-3xl items-start gap-2 rounded-xl border border-border bg-card p-3">
      <p role="status" className="min-w-0 flex-1 font-semibold">{CREATION_MESSAGES.cancelled}</p>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}><X aria-hidden /></Button>
    </div>
  );
}

/** The new-matchup outcome after checkout, from the stored order only. Waiting notes never read as a rejection. */
export function CreationStatusView({ state, onCheckAgain }: { state: ConfirmState<CreationResult>; onCheckAgain: () => void }) {
  const { phase, result: r } = state;
  if (phase === "idle" || phase === "cancelled") return null;
  const wrap = (children: ReactNode) => <div className="mx-auto max-w-xl px-4 py-20 text-center">{children}</div>;
  if (phase === "failed")
    return wrap(<><h1 className="font-display text-4xl font-extrabold">Payment not completed</h1><p className="mt-2 text-muted-foreground">{CREATION_MESSAGES.failed}</p><a href="/create" className="mt-6 inline-block text-primary underline">Start again</a></>);
  if (phase === "paid" && r?.status === "live")
    return wrap(<>
      <h1 className="font-display text-4xl font-extrabold">It's live! 🎉</h1>
      <p className="mt-2 text-muted-foreground">{r.title} is ready for pulls.</p>
      <Link to="/m/$slug" params={{ slug: r.slug }} className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Go to your rope</Link>
    </>);
  if (phase === "paid" && r?.status === "rejected")
    return wrap(<>
      <h1 className="font-display text-4xl font-extrabold">Not approved</h1>
      <p className="mt-2 text-muted-foreground">{r.reason || "This matchup breaks our rules."}</p>
      <p className="mt-2 text-sm">{r.refunded ? "You've been refunded in full." : "A full refund is on its way."}</p>
      <Link to="/rules" className="mt-6 inline-block text-primary underline">See what's allowed</Link>
    </>);
  if (phase === "paid" && r?.status === "refunded")
    return wrap(<><h1 className="font-display text-4xl font-extrabold">Refunded</h1><p className="mt-2 text-muted-foreground">{CREATION_MESSAGES.refunded}</p></>);
  // Still checking: payment or moderation pending (or the calm "still confirming" note after 10 minutes).
  return wrap(<>
    <h1 className="font-display text-4xl font-extrabold">Checking your matchup…</h1>
    <p role="status" className="mt-2 text-muted-foreground">{creationWaitingText(phase, r)}</p>
    {phase === "slow" && <Button variant="outline" size="sm" className="mt-4" onClick={onCheckAgain}>Check again</Button>}
  </>);
}
