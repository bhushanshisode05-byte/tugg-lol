import { createFileRoute } from "@tanstack/react-router";
import { getHallOfFame } from "@/lib/tugg.functions";
import { json, resultItems, FEED_NOTE } from "@/lib/feeds";
export const Route = createFileRoute("/feeds/results.json")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const d = await getHallOfFame();
    return json({ name: "Tugg daily round results", note: FEED_NOTE, generated_at: new Date().toISOString(), results: resultItems(d.cards) });
  } } },
});
