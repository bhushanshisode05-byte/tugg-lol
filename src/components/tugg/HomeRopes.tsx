import { Link } from "@tanstack/react-router";
import { SideAvatar } from "./SideAvatar";
import { ShareButton } from "./ShareButton";
import { Rope, usd } from "./Rope";
import { RoundStatus } from "./RoundStatus";
import { cardVersion, matchupCardInput } from "@/lib/og/card";
import { openRoundsPulled, pullersText } from "@/lib/rounds";
import type { Matchup } from "@/lib/tugg.functions";

export const toShare = (m: Matchup) => ({
  slug: m.slug,
  title: m.title,
  sides: m.sides,
  a: m.round?.total_a_cents ?? 0,
  b: m.round?.total_b_cents ?? 0,
  v: (() => { const input = matchupCardInput(m); return input ? cardVersion(input) : null; })(),
});

/** Home hero badge: money in the open rounds, worded from those rounds' own lengths. Nothing with no open round. */
export function OpenRoundsPulled({ matchups }: { matchups: Matchup[] }) {
  const pulled = openRoundsPulled(matchups.flatMap((m) => (m.round ? [m.round] : [])));
  if (!pulled) return null;
  return (
    <p className="mb-3 inline-block rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-widest text-muted-foreground" data-open-rounds-pulled>
      {usd(pulled.cents)} pulled {pulled.period}
    </p>
  );
}

/** One trending rope on the home page. Every period word comes from this matchup's own open round. */
export function TrendingRopeCard({ m, siteUrl }: { m: Matchup; siteUrl: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary" data-rope-card>
      <Link to="/m/$slug" params={{ slug: m.slug }} className="block">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span>{m.category}</span>
          {m.source === "ai" && <span>Added by Tugg</span>}
        </div>
        <h3 className="mt-1 text-xl font-extrabold">
          <SideAvatar side={m.sides[0]} /> {m.title} <SideAvatar side={m.sides[1]} />
        </h3>
        <Rope size="sm" sides={m.sides} a={m.round?.total_a_cents ?? 0} b={m.round?.total_b_cents ?? 0} />
        <div className="flex items-baseline justify-between gap-2 font-mono text-sm">
          <span>{usd(m.round?.total_a_cents ?? 0)}</span>
          <span className="text-center text-xs text-muted-foreground">{pullersText(m.round?.round_length, m.round?.pullers ?? 0)}</span>
          <span>{usd(m.round?.total_b_cents ?? 0)}</span>
        </div>
      </Link>
      <div className="mt-3 flex items-center justify-between gap-2">
        {m.round ? <RoundStatus round={m.round} className="text-xs font-bold text-muted-foreground" /> : <span />}
        <ShareButton siteUrl={siteUrl} m={toShare(m)} />
      </div>
    </div>
  );
}
