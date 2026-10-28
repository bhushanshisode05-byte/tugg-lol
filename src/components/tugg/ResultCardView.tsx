import { Link } from "@tanstack/react-router";
import type { ResultCard } from "@/lib/tugg.functions";
import { Rope, usd } from "./Rope";

export function ResultCardView({ c, big }: { c: ResultCard; big?: boolean }) {
  const winnerIsA = c.winner.position === 0;
  const sides = winnerIsA ? [c.winner, c.loser] : [c.loser, c.winner];
  const a = winnerIsA ? c.winner_cents : c.loser_cents;
  const b = winnerIsA ? c.loser_cents : c.winner_cents;
  const date = new Date(c.ends_at).toISOString().slice(0, 10);
  return (
    <div className={`rounded-2xl border-2 border-foreground bg-card shadow-pop ${big ? "p-6 sm:p-10" : "p-5"}`}>
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <span>Round ending {date} UTC</span>
        {c.note === "tie" && <span className="text-accent">Tie-break</span>}
      </div>
      <p className={`mt-2 font-display font-extrabold leading-none ${big ? "text-5xl sm:text-7xl" : "text-3xl"}`}>
        {c.winner.emoji} {c.winner.name} <span className="text-primary">won</span>
      </p>
      <p className="mt-1 text-muted-foreground">
        beat {c.loser.name} {usd(c.winner_cents)} to {usd(c.loser_cents)} · {c.pullers} pullers
      </p>
      <Rope size={big ? "lg" : "sm"} sides={sides} a={a} b={b} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link to="/m/$slug" params={{ slug: c.slug }} className="font-bold underline">{c.title}</Link>
        {!big && <Link to="/results/$id" params={{ id: c.id }} className="rounded-full border border-border px-3 py-1 font-bold">Share card</Link>}
      </div>
    </div>
  );
}
