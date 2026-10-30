import { createFileRoute } from "@tanstack/react-router";
import { getHome } from "@/lib/tugg.functions";
import { json, matchupItems, FEED_NOTE } from "@/lib/feeds";
export const Route = createFileRoute("/feeds/matchups.json")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const d = await getHome();
    return json({ name: "Tugg live matchups", note: FEED_NOTE, generated_at: new Date().toISOString(), matchups: matchupItems(d.matchups) });
  } } },
});
