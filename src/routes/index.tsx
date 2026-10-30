import { SideAvatar } from "@/components/tugg/SideAvatar";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShareButton } from "@/components/tugg/ShareButton";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getHome, type Matchup } from "@/lib/tugg.functions";
import { Shell } from "@/components/tugg/Shell";
import { Rope, usd } from "@/components/tugg/Rope";
import { Countdown } from "@/components/tugg/Countdown";
import { useLive } from "@/hooks/use-live";

const homeQuery = queryOptions({ queryKey: ["home"], queryFn: () => getHome() });
const CATEGORIES = [
  "All",
  "Tech",
  "Brands",
  "Cities",
  "Countries",
  "Sports",
  "Food",
  "Entertainment",
  "Other",
];

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Tugg — Pay to pull. The world's rivalry rope." },
      {
        name: "description",
        content:
          "Pick a side in rivalries like Cursor vs Claude Code or Pizza vs Burgers and pull the rope with real dollars. 24-hour rounds, bragging rights only.",
      },
      { property: "og:title", content: "Tugg — Pay to pull the rope for your side" },
      {
        property: "og:description",
        content:
          "A global pay-to-pull rivalry game. Every dollar moves the rope. Rounds end at 00:00 UTC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQuery),
  component: Home,
});

const toShare = (m: Matchup) => ({
  slug: m.slug,
  title: m.title,
  sides: m.sides,
  a: m.round?.total_a_cents ?? 0,
  b: m.round?.total_b_cents ?? 0,
});

function total(m: Matchup) {
  return (m.round?.total_a_cents ?? 0) + (m.round?.total_b_cents ?? 0);
}

function Home() {
  const { data } = useSuspenseQuery(homeQuery);
  const qc = useQueryClient();
  useLive(() => qc.invalidateQueries({ queryKey: ["home"] }));
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");

  const featured = useMemo(() => {
    const f = data.matchups.filter(
      (m) => m.featured_until && new Date(m.featured_until) > new Date(),
    );
    const pool = f.length ? f : data.matchups;
    return [...pool].sort((a, b) => total(b) - total(a))[0];
  }, [data.matchups]);

  const list = data.matchups
    .filter((m) => cat === "All" || m.category === cat)
    .filter((m) => !q || m.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => total(b) - total(a));

  const sideName = new Map(data.matchups.flatMap((m) => m.sides.map((s) => [s.id, s] as const)));

  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:pt-16">
        <p className="mb-3 inline-block rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {usd(data.pulledTodayCents)} pulled today
        </p>
        <h1 className="font-display text-5xl font-extrabold leading-[0.9] sm:text-8xl">
          Pay to pull.
          <br />
          <span className="text-primary">Pick a side.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Every dollar drags the rope toward your team. Rounds end at 00:00 UTC. Winners get a
          badge. Nobody gets paid. That's the fun.
        </p>

        {featured && (
          <Link
            to="/m/$slug"
            params={{ slug: featured.slug }}
            className="mt-8 block rounded-2xl border-2 border-foreground bg-card p-5 shadow-pop transition-transform hover:-translate-y-1 sm:p-8"
          >
            <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <span>Featured rope</span>
              {featured.round && (
                <span>
                  Ends in <Countdown to={featured.round.ends_at} />
                </span>
              )}
            </div>
            <h2 className="font-display text-3xl font-extrabold sm:text-5xl">{featured.title}</h2>
            <div className="mt-4">
              <Rope
                sides={featured.sides}
                a={featured.round?.total_a_cents ?? 0}
                b={featured.round?.total_b_cents ?? 0}
              />
            </div>
            <div className="flex justify-between font-mono text-xl font-bold">
              <span>{usd(featured.round?.total_a_cents ?? 0)}</span>
              <span>{usd(featured.round?.total_b_cents ?? 0)}</span>
            </div>
          </Link>
        )}
        {featured && (
          <div className="mt-3 flex justify-end">
            <ShareButton siteUrl={data.siteUrl} m={toShare(featured)} />
          </div>
        )}
      </section>

      <div className="overflow-hidden border-y border-border bg-card py-2">
        {data.recent.length ? (
          <div className="flex w-max animate-ticker gap-8 whitespace-nowrap text-sm font-semibold">
            {[...data.recent, ...data.recent].map((p, i) => (
              <span key={p.id + i}>
                <span className="text-primary">{usd(p.amount_cents)}</span>{" "}
                {p.display_name || "Someone"} → <SideAvatar side={sideName.get(p.side_id)} />{" "}
                {sideName.get(p.side_id)?.name}
                {p.country ? ` · ${p.country}` : ""}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No pulls yet. Be the first to move a rope.
          </p>
        )}
      </div>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-3xl font-extrabold">Trending ropes</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search matchups…"
            aria-label="Search matchups"
            className="w-full rounded-full border border-input bg-card px-4 py-2 sm:w-64"
          />
        </div>
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ${cat === c ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <div
              key={m.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <Link to="/m/$slug" params={{ slug: m.slug }} className="block">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <span>{m.category}</span>
                  {m.source === "ai" && <span>Added by Tugg</span>}
                </div>
                <h3 className="mt-1 text-xl font-extrabold">
                  <SideAvatar side={m.sides[0]} /> {m.title} <SideAvatar side={m.sides[1]} />
                </h3>
                <Rope
                  size="sm"
                  sides={m.sides}
                  a={m.round?.total_a_cents ?? 0}
                  b={m.round?.total_b_cents ?? 0}
                />
                <div className="flex justify-between font-mono text-sm">
                  <span>{usd(m.round?.total_a_cents ?? 0)}</span>
                  <span className="text-muted-foreground">{m.round?.pullers ?? 0} pullers</span>
                  <span>{usd(m.round?.total_b_cents ?? 0)}</span>
                </div>
              </Link>
              <div className="mt-3 flex justify-end">
                <ShareButton siteUrl={data.siteUrl} m={toShare(m)} />
              </div>
            </div>
          ))}
        </div>
        {!list.length && (
          <p className="text-muted-foreground">
            No matchups match.{" "}
            <Link to="/create" className="text-primary underline">
              Create one
            </Link>
            .
          </p>
        )}
      </section>
    </Shell>
  );
}
