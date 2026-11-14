import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Rope, usd } from "./Rope";
import { SideAvatar } from "./SideAvatar";
import { ShareButton } from "./ShareButton";
import { receiptHeadline } from "@/lib/og/card";
import { currentRound } from "@/lib/rounds";
import { ENGAGEMENT_DISCLOSURE } from "@/lib/engagement/rules";
import { CONFIRM_MESSAGES, totalsBefore, type ConfirmState, type PaymentReceipt as Receipt, type ReceiptLine } from "@/lib/payments/confirmation";

/** Rope that starts where it was before this payment and slides to its new position. */
function RopeMove({ line }: { line: ReceiptLine }) {
  const before = totalsBefore(line);
  const [totals, setTotals] = useState(before);
  useEffect(() => { const t = setTimeout(() => setTotals({ a: line.totalA, b: line.totalB }), 80); return () => clearTimeout(t); }, [line.totalA, line.totalB]);
  return <Rope sides={line.sides} a={totals.a} b={totals.b} />;
}

function LineResult({ line, siteUrl }: { line: ReceiptLine; siteUrl: string }) {
  const side = line.sides.find((s) => s.id === line.sideId), other = line.sides.find((s) => s.id !== line.sideId);
  const sideCents = line.sides[0]?.id === line.sideId ? line.totalA : line.totalB, otherCents = line.sides[0]?.id === line.sideId ? line.totalB : line.totalA;
  return <div className="rounded-xl border border-border bg-background/60 p-3" data-receipt-line>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{line.title}</p>
        <p className="font-semibold"><SideAvatar side={side} /> {side?.name} · {line.pulls} {line.pulls === 1 ? "pull" : "pulls"}</p>
      </div>
      <ShareButton siteUrl={siteUrl} m={line.pull && side
        // The personal pull card: a permanent snapshot of what this buyer did.
        ? { slug: line.slug, title: line.title, sides: line.sides, a: line.pull.totalA, b: line.pull.totalB, pull: { id: line.pull.id, count: line.pulls, sideName: side.name } }
        : { slug: line.slug, title: line.title, sides: line.sides, a: line.totalA, b: line.totalB }} />
    </div>
    <div className="mt-2"><RopeMove line={line} /></div>
    <p className="mt-1 text-sm text-muted-foreground">
      <strong className="text-foreground">{side?.name} now {usd(sideCents)}</strong> in {currentRound(line.roundLength ?? "daily")} vs {other?.name} {usd(otherCents)}
      {side ? <> · {side.name} all-time {usd(side.all_time_cents)}</> : null}
    </p>
  </div>;
}

/** Receipt and payoff after a confirmed payment. `extras` is a reserved slot (e.g. future badges); nothing renders there today. */
export function PaymentReceipt({ receipt, extras }: { receipt: Receipt; extras?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, []);
  const single = receipt.lines.length === 1 ? receipt.lines[0] : undefined;
  const sideName = single?.sides.find((s) => s.id === single.sideId)?.name;
  const applied = receipt.pulls - receipt.refundedPulls;
  return <section ref={ref} aria-labelledby="receipt-title" className="mt-4 rounded-2xl border-2 border-primary bg-primary/10 p-4 sm:p-5" data-receipt>
    <div className={extras ? "grid gap-4 sm:grid-cols-[1fr_auto]" : "grid gap-4"}>
      <div role="status">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Payment confirmed</p>
        <h3 id="receipt-title" className="font-display text-2xl font-extrabold leading-tight">
          {single ? receiptHeadline(applied, sideName ?? "") : `You pulled ${applied} across ${receipt.lines.length} matchups!`}
        </h3>
      </div>
      {extras ? <aside data-slot="receipt-extras" className="sm:row-span-2">{extras}</aside> : null}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Amount paid</dt><dd className="font-mono text-lg font-bold">{usd(receipt.amountCents)} USD</dd></div>
        <div><dt className="text-muted-foreground">Pulls</dt><dd className="font-mono text-lg font-bold">{applied}</dd></div>
        <div><dt className="text-muted-foreground">{single ? "Side" : "Sides"}</dt><dd className="font-semibold">{single ? sideName : `${receipt.lines.length} sides`}</dd></div>
        <div><dt className="text-muted-foreground">{single ? "Matchup" : "Matchups"}</dt><dd className="font-semibold">{single ? single.title : `${receipt.lines.length} matchups`}</dd></div>
      </dl>
    </div>
    {receipt.refundedPulls > 0 && <p className="mt-3 text-sm">{receipt.refundedPulls} pulls are being refunded because a matchup stopped taking pulls before your payment was applied.</p>}
    <div className="mt-4 space-y-3">{receipt.lines.map((line) => <LineResult key={line.matchupId} line={line} siteUrl={receipt.siteUrl} />)}</div>
    <p className="mt-3 text-xs text-muted-foreground" data-engagement-disclosure>{ENGAGEMENT_DISCLOSURE}</p>
  </section>;
}

/** What the buyer sees after checkout: calm waiting notes, a real failure only for failed/expired orders, then the receipt. */
export function PaymentConfirmation({ state, paidText, onCheckAgain, extras }: { state: ConfirmState; paidText: string; onCheckAgain: () => void; extras?: ReactNode }) {
  const { phase, result } = state;
  if (phase === "idle") return null;
  if (phase === "paid") return result?.receipt && result.receipt.lines.length ? <PaymentReceipt receipt={result.receipt} extras={extras} /> : <p role="status" className="mt-3 font-semibold">{paidText}</p>;
  if (phase === "slow") return <div role="status" className="mt-3 rounded-xl border border-border bg-card p-3">
    <p className="font-semibold">{CONFIRM_MESSAGES.slow}</p>
    <Button variant="outline" size="sm" className="mt-2" onClick={onCheckAgain}>Check again</Button>
  </div>;
  return <p role="status" className="mt-3 font-semibold">{CONFIRM_MESSAGES[phase]}</p>;
}
