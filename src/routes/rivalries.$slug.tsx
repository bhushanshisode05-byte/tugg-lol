import { SideAvatar } from "@/components/tugg/SideAvatar";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/tugg/Shell";
import { RouteError, NotFoundBlock } from "@/components/tugg/RouteError";
import { Rope, usd } from "@/components/tugg/Rope";
import { RoundStatus } from "@/components/tugg/RoundStatus";
import { useLive } from "@/hooks/use-live";
import { getMatchup } from "@/lib/tugg.functions";
import { cardVersion, matchupCardInput, matchupImagePath, PUBLIC_SITE } from "@/lib/og/card";
import { AllTimeScore } from "@/components/tugg/AllTimeScore";
import { allTimeSentence, isEmptyRound, recordText, roundLength, roundSentence } from "@/lib/matchup-facts";
import { CurrentRound, closedRoundName, currentRound, pullersText, roundCloses } from "@/lib/rounds";

const mq = (slug: string) =>
  queryOptions({ queryKey: ["matchup", slug], queryFn: () => getMatchup({ data: { slug } }) });

type Data = NonNullable<Awaited<ReturnType<typeof getMatchup>>>;

function facts(d: Data) {
  const m = d.matchup;
  const A = m.sides[0]!,
    B = m.sides[1]!;
  const a = m.round?.total_a_cents ?? 0,
    b = m.round?.total_b_cents ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const len = roundLength(m);
  const empty = isEmptyRound(m);
  const leader = a > b ? A : b > a ? B : null;
  const answer = leader
    ? `As of ${today} (UTC), ${leader.name} is winning ${currentRound(len)}, ${usd(Math.max(a, b))} to ${usd(Math.min(a, b))}.`
    : roundSentence(m, today);
  const rec = recordText(m);
  const record = rec ? `Rounds won all-time: ${rec}.` : "No rounds have been completed yet.";
  const allTime = allTimeSentence(m);
  const faq = [
    { q: `Who is winning, ${A.name} or ${B.name}?`, a: `${answer} ${record}` },
    {
      q: `Who has won more rounds?`,
      a:
        (A.wins === B.wins
          ? `They are level at ${A.wins} round wins each.`
          : `${A.wins > B.wins ? A.name : B.name} leads with ${Math.max(A.wins, B.wins)} round wins to ${Math.min(A.wins, B.wins)}.`) +
        (m.history?.rounds ? ` ${m.history.rounds} round${m.history.rounds === 1 ? " has" : "s have"} been completed; this record never resets.` : ""),
    },
    {
      q: `What is the longest win streak?`,
      a:
        A.best_streak === 0 && B.best_streak === 0
          ? "No side has won a round yet."
          : `${A.best_streak >= B.best_streak ? A.name : B.name} holds the best streak at ${Math.max(A.best_streak, B.best_streak)} rounds in a row.`,
    },
    {
      q: "How does the vote work?",
      a: `Anyone can pay to pull the rope toward their side. The side with more money when the ${roundCloses(len)} wins. All-time totals and round wins never reset. Nothing is paid out: it is entertainment and bragging rights only.`,
    },
  ];
  return { A, B, a, b, answer, record, allTime, faq, leader, len, empty };
}

export const Route = createFileRoute("/rivalries/$slug")({
  staticData: { sitemap: true },
  loader: async ({ context, params }) => {
    const d = await context.queryClient.ensureQueryData(mq(params.slug));
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData)
      return {
        meta: [{ title: "Rivalry unavailable | Tugg" }, { name: "robots", content: "noindex" }],
      };
    const f = facts(loaderData);
    const card = matchupCardInput(loaderData.matchup);
    const img = `${loaderData.siteUrl || PUBLIC_SITE}${matchupImagePath(params.slug, "link", card ? cardVersion(card) : null)}`;
    const title = `Who is winning, ${f.A.name} or ${f.B.name}? Live results | Tugg`;
    return {
      meta: [
        { title },
        { name: "description", content: `${f.answer} ${f.record}` },
        { property: "og:title", content: `Who is winning, ${f.A.name} or ${f.B.name}?` },
        { property: "og:description", content: f.answer },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `/rivalries/${params.slug}` },
        {
          property: "og:image",
          content: img,
        },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        {
          name: "twitter:image",
          content: img,
        },
      ],
      links: [{ rel: "canonical", href: `/rivalries/${params.slug}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: f.faq.map((x) => ({
              "@type": "Question",
              name: x.q,
              acceptedAnswer: { "@type": "Answer", text: x.a },
            })),
          }),
        },
      ],
    };
  },
  errorComponent: RouteError,
  notFoundComponent: () => <NotFoundBlock text="No rivalry here." />,
  component: Rivalry,
});

function Rivalry() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(mq(slug));
  const qc = useQueryClient();
  useLive(() => qc.invalidateQueries({ queryKey: ["matchup", slug] }), data?.matchup.id);
  if (!data) return null;
  const f = facts(data);
  const m = data.matchup;
  const byId = new Map(m.sides.map((s) => [s.id, s]));
  return (
    <Shell>
      <article className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-4xl font-extrabold leading-none sm:text-6xl">
          Who is winning, {f.A.name} or {f.B.name}?
        </h1>
        <p className="mt-4 text-xl font-bold">
          {f.leader ? (
            <span style={{ color: f.leader.color }}>
              <SideAvatar side={f.leader} /> {f.leader.name}
            </span>
          ) : (
            "Nobody"
          )}{" "}
          {f.leader ? "is ahead right now." : "is ahead yet."}
        </p>
        <p className="mt-2 text-muted-foreground">
          {f.answer} {f.allTime}
        </p>

        {f.empty && (
          <div className="mt-8">
            <AllTimeScore m={m} lead />
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-border bg-card p-5" data-live-round>
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {m.round ? <RoundStatus round={m.round} /> : <span className="inline-flex h-5 items-center">{CurrentRound(f.len)}</span>}
          </div>
          <Rope sides={m.sides} a={f.a} b={f.b} />
          <div className={`flex justify-between font-mono ${f.empty ? "text-lg font-bold text-muted-foreground" : "text-2xl font-extrabold"}`}>
            <span>{usd(f.a)}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {pullersText(f.len, f.empty ? 0 : (m.round?.pullers ?? 0))}
            </span>
            <span>{usd(f.b)}</span>
          </div>
          <Link
            to="/m/$slug"
            params={{ slug }}
            className="mt-4 block rounded-full bg-primary py-3 text-center font-display text-lg font-extrabold text-primary-foreground shadow-pop"
          >
            Pull for your side
          </Link>
        </div>

        {!f.empty && (
          <div className="mt-6">
            <AllTimeScore m={m} />
          </div>
        )}

        <section className="mt-8">
          <h2 className="text-2xl font-extrabold">Round history</h2>
          {data.history.length ? (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">Round (UTC)</th>
                  <th>Winner</th>
                  <th className="text-right">{f.A.name}</th>
                  <th className="text-right">{f.B.name}</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="py-2">{closedRoundName(h.round_length, h.starts_at, h.ends_at)}</td>
                    <td>
                      {h.winner_side_id
                        ? `${byId.get(h.winner_side_id)?.name}${h.result_note === "tie" ? " (tie-break)" : ""}`
                        : "No pulls"}
                    </td>
                    <td className="text-right font-mono">{usd(Number(h.total_a_cents))}</td>
                    <td className="text-right font-mono">{usd(Number(h.total_b_cents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-muted-foreground">The first round is still in progress.</p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-extrabold">FAQ</h2>
          <dl className="mt-3 space-y-4">
            {f.faq.map((x) => (
              <div key={x.q} className="rounded-xl border border-border bg-card p-4">
                <dt className="font-bold">{x.q}</dt>
                <dd className="mt-1 text-muted-foreground">{x.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </Shell>
  );
}
