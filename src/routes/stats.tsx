import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/tugg/Shell";
import { getStats } from "@/lib/tugg.functions";
import { usd } from "@/components/tugg/Rope";

const sq = queryOptions({ queryKey: ["stats"], queryFn: () => getStats() });

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Live stats | Tugg" },
      { name: "description", content: "Real-time Tugg numbers: total pulled, pulls today, active matchups, countries represented and rounds completed." },
      { property: "og:title", content: "Tugg live stats" },
      { property: "og:description", content: "Real data only. Watch the world pull." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(sq),
  component: Stats,
});

function Stats() {
  const { data } = useSuspenseQuery(sq);
  const items = [
    ["Total pulled", usd(data.totalCents)],
    ["Total pulls", data.totalPulls.toLocaleString()],
    ["Pulls today", data.pullsToday.toLocaleString()],
    ["Active matchups", String(data.activeMatchups)],
    ["Countries", String(data.countries)],
    ["Rounds completed", data.roundsCompleted.toLocaleString()],
  ];
  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="font-display text-5xl font-extrabold">Live stats</h1>
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          {items.map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{k}</p>
              <p className="mt-1 font-mono text-3xl font-extrabold">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
