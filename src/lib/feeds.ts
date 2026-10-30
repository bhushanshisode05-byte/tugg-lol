import { usd } from "@/components/tugg/Rope";
import { PUBLIC_SITE, matchupImagePath, resultImagePath } from "@/lib/og/card";

export const FEED_HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=300", "Access-Control-Allow-Origin": "*" };
export const FEED_NOTE = "Real Tugg data only. Amounts are US dollars actually paid. Rounds close daily at 00:00 UTC. No prizes or payouts.";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export type RssItem = { title: string; link: string; description: string; date: string; guid: string; image?: string };
export function rss(title: string, path: string, description: string, items: RssItem[]) {
  const body = items
    .map(
      (i) =>
        `<item><title>${esc(i.title)}</title><link>${esc(i.link)}</link><guid isPermaLink="false">${esc(i.guid)}</guid><pubDate>${new Date(i.date).toUTCString()}</pubDate><description>${esc(i.description)}</description>${i.image ? `<enclosure url="${esc(i.image)}" type="image/png" length="0"/>` : ""}</item>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(title)}</title><link>${PUBLIC_SITE}</link><atom:link href="${PUBLIC_SITE}${path}" rel="self" type="application/rss+xml"/><description>${esc(description)}</description><language>en</language>${body}</channel></rss>`,
    { headers: { ...FEED_HEADERS, "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
}
export const json = (data: unknown) => Response.json(data, { headers: FEED_HEADERS });

type HomeM = { slug: string; title: string; category: string; source: string; created_at: string; sides: { name: string; emoji: string }[]; round: { starts_at: string; ends_at: string; total_a_cents: number; total_b_cents: number; pullers: number } | null };
export function matchupItems(ms: HomeM[]) {
  return ms.map((m) => {
    const [a, b] = m.sides;
    const ra = m.round?.total_a_cents ?? 0, rb = m.round?.total_b_cents ?? 0;
    return {
      slug: m.slug,
      title: m.title,
      url: `${PUBLIC_SITE}/m/${m.slug}`,
      rivalry_url: `${PUBLIC_SITE}/rivalries/${m.slug}`,
      image: `${PUBLIC_SITE}${matchupImagePath(m.slug, "link")}`,
      category: m.category,
      added_by: m.source === "ai" ? "Tugg" : m.source === "seed" ? "Tugg" : "player",
      created_at: m.created_at,
      round: m.round
        ? { starts_at: m.round.starts_at, ends_at: m.round.ends_at, pullers: m.round.pullers, a: { name: a?.name, dollars: ra / 100 }, b: { name: b?.name, dollars: rb / 100 } }
        : null,
      summary: `${a?.name} ${usd(ra)} vs ${b?.name} ${usd(rb)} in the current round.`,
    };
  });
}

type Card = { id: string; slug: string; title: string; ends_at: string; winner: { name: string }; loser: { name: string }; winner_cents: number; loser_cents: number; pullers: number; note: string | null };
export function resultItems(cards: Card[]) {
  return cards.map((c) => ({
    id: c.id,
    matchup: c.title,
    matchup_url: `${PUBLIC_SITE}/m/${c.slug}`,
    url: `${PUBLIC_SITE}/results/${c.id}`,
    image: `${PUBLIC_SITE}${resultImagePath(c.id, "link")}`,
    round_day_utc: new Date(new Date(c.ends_at).getTime() - 1000).toISOString().slice(0, 10),
    ended_at: c.ends_at,
    winner: c.winner.name,
    loser: c.loser.name,
    winner_dollars: c.winner_cents / 100,
    loser_dollars: c.loser_cents / 100,
    pullers: c.pullers,
    tie_break: c.note === "tie",
    summary: `${c.winner.name} beat ${c.loser.name} ${usd(c.winner_cents)} to ${usd(c.loser_cents)} in ${c.title}.`,
  }));
}
