import { usd } from "@/components/tugg/Rope";
import { addedByTugg } from "./matchup-source";
import { PUBLIC_SITE, cardVersion, matchupCardInput, matchupImagePath, resultCardInput, resultImagePath } from "@/lib/og/card";
import { ROUND_LENGTH_SHORT, roundLengthOf, roundName } from "@/lib/rounds";

export const FEED_HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=300", "Access-Control-Allow-Origin": "*" };
export const FEED_NOTE = `Real Tugg data only. Amounts are US dollars actually paid. ${ROUND_LENGTH_SHORT} All-time totals never reset. No prizes or payouts.`;

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

type HomeM = { slug: string; title: string; category: string; source: string; created_at: string; sides: { id?: string; name: string; emoji: string; color: string; position: number; image_id?: string | null; image_status?: string | null; all_time_cents?: number; wins?: number }[]; round: { starts_at: string; ends_at: string; total_a_cents: number; total_b_cents: number; pullers: number; round_length?: string } | null; history?: { rounds: number; last: { winner_side_id: string | null; note: string | null; total_a_cents: number; total_b_cents: number } | null } | null };
export function matchupItems(ms: HomeM[]) {
  return ms.map((m) => {
    const [a, b] = m.sides;
    const ra = m.round?.total_a_cents ?? 0, rb = m.round?.total_b_cents ?? 0;
    return {
      slug: m.slug,
      title: m.title,
      url: `${PUBLIC_SITE}/m/${m.slug}`,
      rivalry_url: `${PUBLIC_SITE}/rivalries/${m.slug}`,
      image: `${PUBLIC_SITE}${matchupImagePath(m.slug, "link", (() => { const input = matchupCardInput(m); return input ? cardVersion(input) : null; })())}`,
      category: m.category,
      added_by: addedByTugg(m.source) || m.source === "seed" ? "Tugg" : "player",
      created_at: m.created_at,
      round: m.round
        ? { length: roundLengthOf(m.round.round_length), name: roundName(roundLengthOf(m.round.round_length), m.round.starts_at), starts_at: m.round.starts_at, ends_at: m.round.ends_at, pullers: m.round.pullers, a: { name: a?.name, dollars: ra / 100 }, b: { name: b?.name, dollars: rb / 100 } }
        : null,
      all_time: { a: { name: a?.name, dollars: (a?.all_time_cents ?? 0) / 100, round_wins: a?.wins ?? 0 }, b: { name: b?.name, dollars: (b?.all_time_cents ?? 0) / 100, round_wins: b?.wins ?? 0 }, rounds_completed: m.history?.rounds ?? 0 },
      summary: `${a?.name} ${usd(ra)} vs ${b?.name} ${usd(rb)} in the current round.`,
    };
  });
}

type CardSideLite = { name: string; emoji: string; color: string; image_id?: string | null; image_status?: string | null };
type Card = { id: string; slug: string; title: string; ends_at: string; starts_at?: string | undefined; round_length?: string | undefined; winner: CardSideLite & { position: number }; loser: CardSideLite; winner_cents: number; loser_cents: number; pullers: number; note: string | null };
export function resultItems(cards: Card[]) {
  return cards.map((c) => ({
    id: c.id,
    matchup: c.title,
    matchup_url: `${PUBLIC_SITE}/m/${c.slug}`,
    url: `${PUBLIC_SITE}/results/${c.id}`,
    image: `${PUBLIC_SITE}${resultImagePath(c.id, "link", cardVersion(resultCardInput(c)))}`,
    round_day_utc: new Date(new Date(c.ends_at).getTime() - 1000).toISOString().slice(0, 10),
    round_length: roundLengthOf(c.round_length),
    round_name: c.round_length === "weekly" && c.starts_at ? roundName("weekly", c.starts_at) : new Date(new Date(c.ends_at).getTime() - 1000).toISOString().slice(0, 10),
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
