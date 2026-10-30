import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Shell } from "@/components/tugg/Shell";
import { RouteError, NotFoundBlock } from "@/components/tugg/RouteError";
import { usd } from "@/components/tugg/Rope";
import { getLeaderboards } from "@/lib/tugg.functions";

const lq = queryOptions({ queryKey: ["leaderboards"], queryFn: () => getLeaderboards() });

export const Route = createFileRoute("/leaderboards")({
  staticData: { sitemap: true },
  loader: ({ context }) => context.queryClient.ensureQueryData(lq),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Leaderboards: biggest ropes and longest streaks | Tugg" },
      { name: "description", content: "The biggest Tugg ropes ever, longest win streaks, most-pulled matchups today and top countries. Real pulls only." },
      { property: "og:title", content: "Tugg leaderboards" },
      { property: "og:description", content: "Biggest ropes, longest streaks, today's hottest rivalries and top countries." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/leaderboards" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/leaderboards" }],
    scripts: loaderData
      ? [{
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Biggest Tugg ropes ever",
            itemListElement: loaderData.biggest.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: `${r.title}: ${usd(r.total_a + r.total_b)}`, url: `/m/${r.slug}` })),
          }),
        }]
      : [],
  }),
  errorComponent: RouteError,
  notFoundComponent: () => <NotFoundBlock />,
  component: Leaderboards,
});

function Board({ title, empty, emptyText = "No pulls yet. The first real pull puts someone on this board.", children }: { title: string; empty: boolean; emptyText?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {empty ? <p className="text-sm text-muted-foreground">{emptyText}</p> : <ol className="space-y-2">{children}</ol>}
    </section>
  );
}

function Row({ i, children, right }: { i: number; children: ReactNode; right: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2"><span className="w-6 font-mono text-muted-foreground">{i + 1}</span><span className="truncate">{children}</span></span>
      <span className="shrink-0 font-mono font-bold">{right}</span>
    </li>
  );
}

function Leaderboards() {
  const { data } = useSuspenseQuery(lq);
  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-5xl font-extrabold">Leaderboards</h1>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Board title="Biggest ropes ever" empty={!data.biggest.length}>
            {data.biggest.map((r, i) => (
              <Row key={r.id} i={i} right={usd(r.total_a + r.total_b)}>
                <Link to="/m/$slug" params={{ slug: r.slug }} className="font-bold hover:text-primary">{r.title}</Link>
                <span className="text-muted-foreground"> · {r.open ? "today" : new Date(r.ends_at).toISOString().slice(0, 10)}</span>
              </Row>
            ))}
          </Board>
          <Board title="Most pulled today" empty={!data.today.length}>
            {data.today.map((r, i) => (
              <Row key={r.id} i={i} right={usd(r.total_a + r.total_b)}>
                <Link to="/m/$slug" params={{ slug: r.slug }} className="font-bold hover:text-primary">{r.title}</Link>
                <span className="text-muted-foreground"> · {r.pullers} pullers</span>
              </Row>
            ))}
          </Board>
          <Board title="Longest win streaks" empty={!data.streaks.length} emptyText="No round winners yet. Streaks start when rounds close at 00:00 UTC.">
            {data.streaks.map((s, i) => (
              <Row key={s.id} i={i} right={`${s.best}🔥`}>
                <span className="font-bold">{s.emoji} {s.name}</span>{" "}
                <Link to="/m/$slug" params={{ slug: s.slug }} className="text-muted-foreground hover:text-primary">in {s.title}</Link>
              </Row>
            ))}
          </Board>
          <Board title="Top countries" empty={!data.countries.length}>
            {data.countries.map((c, i) => (
              <Row key={c.country} i={i} right={usd(c.cents)}>
                <span className="font-bold">{c.country}</span> <span className="text-muted-foreground">· {c.pulls} pulls</span>
              </Row>
            ))}
          </Board>
        </div>
      </div>
    </Shell>
  );
}
