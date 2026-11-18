import { SideAvatar } from "@/components/tugg/SideAvatar";
import { MatchupKicker } from "@/components/tugg/MatchupKicker";
import { ReportImage } from "@/components/tugg/ReportImage";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMatchup, type Side } from "@/lib/tugg.functions";
import { Turnstile } from "@/components/tugg/Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { Shell } from "@/components/tugg/Shell";
import { ShareButton } from "@/components/tugg/ShareButton";
import { Rope, usd } from "@/components/tugg/Rope";
import { RoundStatus } from "@/components/tugg/RoundStatus";
import { ShoutOuts } from "@/components/tugg/ShoutOuts";
import { PullPanel } from "@/components/tugg/PullPanel";
import { useLive } from "@/hooks/use-live";
import { RecentPulls } from "@/components/tugg/RecentPulls";

import { cardVersion, matchupCardInput, matchupImagePath } from "@/lib/og/card";
import { AllTimeScore } from "@/components/tugg/AllTimeScore";
import { allTimeSentence, isEmptyRound, roundLength, roundSentence } from "@/lib/matchup-facts";
import { CurrentRound, closedRoundName, currentRound, pullersText, roundEnds, roundPeriod } from "@/lib/rounds";

const mq = (slug: string) =>
  queryOptions({ queryKey: ["matchup", slug], queryFn: () => getMatchup({ data: { slug } }) });

export const Route = createFileRoute("/m/$slug")({
  staticData: { sitemap: true },
  validateSearch: (s: Record<string, unknown>): { paid?: string | undefined } => ({
    paid: typeof s["paid"] === "string" ? s["paid"] : undefined,
  }),
  loader: async ({ context, params }) => {
    const d = await context.queryClient.ensureQueryData(mq(params.slug));
    if (!d) throw notFound();
    const m = d.matchup;
    return {
      title: m.title,
      slug: m.slug,
      a: m.sides[0]?.name,
      b: m.sides[1]?.name,
      aCents: m.round?.total_a_cents ?? 0,
      bCents: m.round?.total_b_cents ?? 0,
      length: roundLength(m),
      empty: isEmptyRound(m),
      // Quotable lead for empty rounds: history first, never "$0 vs $0".
      history: `${roundSentence(m, new Date().toISOString().slice(0, 10))} ${allTimeSentence(m)}`,
      siteUrl: d.siteUrl || "https://tugg.lol",
      // Score-derived cache key: the image URL changes whenever the score changes.
      version: (() => { const input = matchupCardInput(m); return input ? cardVersion(input) : null; })(),
    };
  },
  head: ({ loaderData: l }) => {
    if (!l)
      return {
        meta: [{ title: "Matchup unavailable | Tugg" }, { name: "robots", content: "noindex" }],
      };
    const score = `${l.a} ${usd(l.aCents)} vs ${l.b} ${usd(l.bCents)}`;
    const url = `${l.siteUrl}/m/${l.slug}`;
    // Own live image; the score token gives every score its own URL, so previews never show an old score.
    const img = `${l.siteUrl}${matchupImagePath(l.slug, "link", l.version)}`;
    const desc = l.empty
      ? `${l.history} Pull the rope for your side on Tugg. ${roundEnds(l.length)}.`
      : `Live now: ${score} in ${currentRound(l.length)}. Pull the rope for your side on Tugg. ${roundEnds(l.length)}.`;
    return {
      meta: [
        { title: `${l.title} — who's winning ${roundPeriod(l.length)}? | Tugg` },
        { name: "description", content: desc },
        { property: "og:title", content: `${l.title} on Tugg` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: img },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:alt", content: l.empty ? `${l.a} vs ${l.b}: new round, all-time score` : `${l.a} vs ${l.b}: ${score}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${l.title} on Tugg` },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: img },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: () => (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold">No rope here.</h1>
        <Link to="/" className="mt-4 inline-block text-primary underline">
          Back to all matchups
        </Link>
      </div>
    </Shell>
  ),
  component: MatchupPage,
});

function MatchupPage() {
  const { slug } = Route.useParams();
  const { paid } = Route.useSearch();
  const { data } = useSuspenseQuery(mq(slug));
  const qc = useQueryClient();
  useLive(() => qc.invalidateQueries({ queryKey: ["matchup", slug] }), data?.matchup.id);
  const [celebrate, setCelebrate] = useState(false);

  if (!data) return null;
  const { matchup: m, top, recent, countries, history } = data;
  const A = m.sides[0]!,
    B = m.sides[1]!;
  const a = m.round?.total_a_cents ?? 0,
    b = m.round?.total_b_cents ?? 0;
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const len = roundLength(m);
  const empty = isEmptyRound(m);
  const sideById = new Map(m.sides.map((s) => [s.id, s]));
  const card = matchupCardInput(m);
  const shareData = { slug: m.slug, title: m.title, sides: m.sides, a, b, v: card ? cardVersion(card) : null };

  return (
    <Shell>
      <article className="mx-auto max-w-5xl px-4 py-8">
        <p
          className="mb-4 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground"
          data-summary
        >
          {roundSentence(m, today)} {allTimeSentence(m)}
        </p>

        {celebrate && (
          <div className="mb-6 rounded-2xl border-2 border-primary bg-primary/10 p-4">
            <p className="font-display text-2xl font-extrabold">You pulled! 🎉</p>
            <p className="text-sm text-muted-foreground">
              Your pull has been recorded on the rope.
            </p>
            <div className="mt-3">
              <ShareButton siteUrl={data.siteUrl} m={shareData} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <MatchupKicker category={m.category} source={m.source} />
          {m.round && <RoundStatus round={m.round} />}
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-4xl font-extrabold leading-none sm:text-6xl">
            {m.title}
          </h1>
          <ShareButton siteUrl={data.siteUrl} m={shareData} />
        </div>
        {m.description && <p className="mt-2 text-muted-foreground">{m.description}</p>}
        <Link
          to="/rivalries/$slug"
          params={{ slug: m.slug }}
          className="mt-2 inline-block text-sm text-muted-foreground underline"
        >
          Who is winning? Full results
        </Link>

        {empty && (
          <div className="mt-8">
            <AllTimeScore m={m} lead />
          </div>
        )}

        <div className="mt-8" data-live-round>
          {empty && (
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {CurrentRound(len)} · live
            </p>
          )}
          <Rope sides={m.sides} a={a} b={b} />
          <div className="mt-2 grid grid-cols-3 items-end">
            <SideTotal side={A} cents={a} quiet={empty} />
            <p className="text-center text-sm text-muted-foreground">
              {empty ? `No pulls yet ${roundPeriod(len)}. Be the first.` : pullersText(len, m.round?.pullers ?? 0)}
            </p>
            <SideTotal side={B} cents={b} right quiet={empty} />
          </div>
          <RecentPulls pulls={data.ticker} className="mt-4" />
        </div>

        {!empty && (
          <div className="mt-6">
            <AllTimeScore m={m} />
          </div>
        )}

        {m.status === "active" ? (
          <PullPanel
            matchupId={m.id}
            title={m.title}
            sides={m.sides}
            slug={m.slug}
            paused={data.paused}
            onPulled={() => {
              setCelebrate(true);
              qc.invalidateQueries({ queryKey: ["matchup", slug] });
            }}
          />
        ) : (
          <p className="mt-8 rounded-xl border border-border p-4 text-muted-foreground">
            This matchup is retired and no longer takes pulls.
          </p>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {m.sides.map((s) => (
            <Panel
              key={s.id}
              title={
                <>
                  Top pullers · <SideAvatar side={s} /> {s.name}
                </>
              }
            >
              {top[s.id]?.length ? (
                <ol className="space-y-1">
                  {(top[s.id] ?? []).map((t, i) => (
                    <li key={t.name} className="flex justify-between">
                      <span>
                        {i + 1}. {t.name}
                      </span>
                      <span className="font-mono">{usd(t.cents)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty />
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Streak {s.current_streak} · Best {s.best_streak} · Wins {s.wins}
              </p>
            </Panel>
          ))}
          <Panel title="Shout-outs">
            {recent.some((p) => p.shout_out) ? (
              <ShoutOuts pulls={recent} sides={m.sides} />
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel title="Countries">
            {countries.length ? (
              <ul className="space-y-1">
                {countries.map((c) => (
                  <li key={c.country} className="flex justify-between">
                    <span>{c.country}</span>
                    <span className="font-mono">{usd(c.cents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </Panel>
          <Panel title="Round history">
            {history.length ? (
              <ul className="space-y-1 text-sm">
                {history.slice(0, 10).map((h) => (
                  <li key={h.id} className="flex justify-between">
                    <span>{closedRoundName(h.round_length, h.starts_at, h.ends_at)}</span>
                    <span>
                      {h.winner_side_id
                        ? `${sideById.get(h.winner_side_id)?.name} won${h.result_note === "tie" ? " (tie)" : ""}`
                        : "No pulls"}
                    </span>
                    <span className="font-mono">
                      {usd(h.total_a_cents)}–{usd(h.total_b_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="First round in progress." />
            )}
          </Panel>
        </div>
      </article>
    </Shell>
  );
}

function SideTotal({ side, cents, right, quiet }: { side: Side; cents: number; right?: boolean; quiet?: boolean }) {
  return (
    <div className={right ? "text-right" : ""}>
      <p className="text-sm font-bold" style={{ color: side.color }}>
        {side.name}
      </p>
      <ReportImage side={side} />
      <p className={quiet ? "font-mono text-lg font-bold text-muted-foreground" : "font-mono text-3xl font-extrabold sm:text-4xl"}>
        {usd(cents)}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
const Empty = ({ text = "Nothing yet." }: { text?: string }) => (
  <p className="text-sm text-muted-foreground">{text}</p>
);
