import type { Matchup } from "./tugg.functions";

/** Display-only: never reorder the shared matchup read or the featured selection pool. */
export function trendingRopes(matchups: readonly Matchup[], category = "All", query = "") {
  return matchups
    .filter((m) => category === "All" || m.category === category)
    .filter((m) => !query || m.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const totalA = (a.round?.total_a_cents ?? 0) + (a.round?.total_b_cents ?? 0);
      const totalB = (b.round?.total_a_cents ?? 0) + (b.round?.total_b_cents ?? 0);
      return totalB - totalA || Date.parse(b.created_at) - Date.parse(a.created_at);
    });
}

export function isNewRope(createdAt: string, now: number) {
  const age = now - Date.parse(createdAt);
  return age >= 0 && age < 48 * 60 * 60 * 1000;
}