import { createFileRoute } from "@tanstack/react-router";
import { getHallOfFame } from "@/lib/tugg.functions";
import { rss, resultItems, FEED_NOTE } from "@/lib/feeds";
export const Route = createFileRoute("/feeds/results.rss")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const items = resultItems((await getHallOfFame()).cards);
    return rss("Tugg round results", "/feeds/results.rss", `Winners of each Tugg round, weekly or daily. ${FEED_NOTE}`,
      items.map((r) => ({ title: `${r.winner} won ${r.matchup} (${r.round_name})`, link: r.url, guid: `result:${r.id}`, date: r.ended_at, description: r.summary, image: r.image })));
  } } },
});
