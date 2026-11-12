import { createFileRoute } from "@tanstack/react-router";
import { getLeaderboards } from "@/lib/tugg.functions";
import { json, FEED_NOTE } from "@/lib/feeds";
import { PUBLIC_SITE } from "@/lib/og/card";
export const Route = createFileRoute("/feeds/leaderboard.json")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const d = await getLeaderboards();
    const rope = (r: (typeof d.biggest)[number]) => ({ matchup: r.title, url: `${PUBLIC_SITE}/m/${r.slug}`, a: { name: r.a.name, dollars: r.total_a / 100 }, b: { name: r.b.name, dollars: r.total_b / 100 }, total_dollars: (r.total_a + r.total_b) / 100, pullers: r.pullers, round_ends_at: r.ends_at, open: r.open });
    return json({
      name: "Tugg leaderboard", note: FEED_NOTE, generated_at: new Date().toISOString(), page: `${PUBLIC_SITE}/leaderboards`,
      biggest_ropes_ever: d.biggest.map(rope),
      // Open rounds of any length; the old key is kept for existing readers.
      most_pulled_open_rounds: d.today.map(rope),
      most_pulled_today: d.today.map(rope),
      longest_win_streaks: d.streaks.map((s) => ({ side: s.name, matchup: s.title, url: `${PUBLIC_SITE}/m/${s.slug}`, best_streak: s.best, current_streak: s.current, wins: s.wins })),
      top_countries: d.countries.map((c) => ({ country: c.country, dollars: c.cents / 100, pulls: c.pulls })),
    });
  } } },
});
