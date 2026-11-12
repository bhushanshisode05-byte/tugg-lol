import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/tugg/Shell";
import { RouteError, NotFoundBlock } from "@/components/tugg/RouteError";
import { ResultCardView } from "@/components/tugg/ResultCardView";
import { getHallOfFame } from "@/lib/tugg.functions";

const hq = queryOptions({ queryKey: ["hall-of-fame"], queryFn: () => getHallOfFame() });

export const Route = createFileRoute("/hall-of-fame")({
  staticData: { sitemap: true },
  loader: ({ context }) => context.queryClient.ensureQueryData(hq),
  head: () => ({
    meta: [
      { title: "Hall of Fame: every Tugg round winner | Tugg" },
      { name: "description", content: "Every side that won a Tugg round, with final totals and a shareable result card for each." },
      { property: "og:title", content: "Tugg Hall of Fame" },
      { property: "og:description", content: "Past round winners and their shareable result cards." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/hall-of-fame" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/hall-of-fame" }],
  }),
  errorComponent: RouteError,
  notFoundComponent: () => <NotFoundBlock />,
  component: Hall,
});

function Hall() {
  const { data } = useSuspenseQuery(hq);
  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-5xl font-extrabold">Hall of Fame</h1>
        <p className="mt-2 text-muted-foreground">Every round winner, crowned when each round closes at 00:00 UTC.</p>
        {data.cards.length ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {data.cards.map((c) => <ResultCardView key={c.id} c={c} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="font-display text-2xl font-extrabold">No champions yet.</p>
            <p className="mt-1 text-muted-foreground">The first winners are crowned when the current rounds close at 00:00 UTC.</p>
            <Link to="/" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground">Go pull a rope</Link>
          </div>
        )}
      </div>
    </Shell>
  );
}
