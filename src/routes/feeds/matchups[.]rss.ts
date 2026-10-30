import { createFileRoute } from "@tanstack/react-router";
import { getHome } from "@/lib/tugg.functions";
import { rss, matchupItems, FEED_NOTE } from "@/lib/feeds";
export const Route = createFileRoute("/feeds/matchups.rss")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const items = matchupItems((await getHome()).matchups).sort((x, y) => y.created_at.localeCompare(x.created_at));
    return rss("Tugg matchups", "/feeds/matchups.rss", `Every live Tugg rivalry. ${FEED_NOTE}`,
      items.map((m) => ({ title: m.title, link: m.url, guid: `matchup:${m.slug}`, date: m.created_at, description: m.summary, image: m.image })));
  } } },
});
