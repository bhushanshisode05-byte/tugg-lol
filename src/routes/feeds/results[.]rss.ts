import { createFileRoute } from "@tanstack/react-router";
import { getHallOfFame } from "@/lib/tugg.functions";
import { rss, resultItems, FEED_NOTE } from "@/lib/feeds";
export const Route = createFileRoute("/feeds/results.rss")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const items = resultItems((await getHallOfFame()).cards);
    return rss("Tugg daily results", "/feeds/results.rss", `Winners of each daily Tugg round. ${FEED_NOTE}`,
      items.map((r) => ({ title: `${r.winner} won ${r.matchup} (${r.round_day_utc})`, link: r.url, guid: `result:${r.id}`, date: r.ended_at, description: r.summary, image: r.image })));
  } } },
});
