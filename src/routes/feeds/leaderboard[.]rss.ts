import { createFileRoute } from "@tanstack/react-router";
import { getLeaderboards } from "@/lib/tugg.functions";
import { rss, FEED_NOTE } from "@/lib/feeds";
import { usd } from "@/components/tugg/Rope";
import { PUBLIC_SITE } from "@/lib/og/card";
export const Route = createFileRoute("/feeds/leaderboard.rss")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const d = await getLeaderboards();
    return rss("Tugg leaderboard: biggest ropes", "/feeds/leaderboard.rss", `The biggest Tugg rounds ever. ${FEED_NOTE}`,
      d.biggest.map((r, i) => ({ title: `#${i + 1} ${r.title}: ${usd(r.total_a + r.total_b)}`, link: `${PUBLIC_SITE}/m/${r.slug}`, guid: `rope:${r.id}`, date: r.ends_at,
        description: `${r.a.name} ${usd(r.total_a)} vs ${r.b.name} ${usd(r.total_b)} from ${r.pullers} pullers${r.open ? " (round still open)" : ""}.` })));
  } } },
});
