import { RECENT_PULLS, toRecentPulls, type RecentPull, type RecentPullSource, type SideLabel } from "./recent-pulls";

type Result<T> = { data: T | null; error: { message: string } | null };
/** The two public reads the feed needs (publishable-key client, RLS intact). */
export type RecentPullsDb = {
  rpc(fn: "tugg_recent_pulls", args: { p_live: boolean; p_limit: number }): PromiseLike<Result<RecentPullSource[]>>;
  from(table: "sides"): {
    select(cols: "id,name,matchups(title)"): {
      in(col: "id", ids: string[]): PromiseLike<Result<{ id: string; name: string; matchups: { title: string } | null }[]>>;
    };
  };
};

/** Site-wide ticker rows: the five newest public pulls, kept only if inside the 48-hour window. */
export async function loadRecentPulls(db: RecentPullsDb, live: boolean, now = Date.now()): Promise<RecentPull[]> {
  const pulls = await db.rpc("tugg_recent_pulls", { p_live: live, p_limit: RECENT_PULLS.limit });
  if (pulls.error) throw new Error(pulls.error.message);
  const rows = (pulls.data ?? []).filter((r) => now - Date.parse(r.created_at) <= RECENT_PULLS.windowHours * 3600_000);
  if (!rows.length) return [];
  const sides = await db.from("sides").select("id,name,matchups(title)").in("id", [...new Set(rows.map((r) => r.side_id))]);
  if (sides.error) throw new Error(sides.error.message);
  const labels = new Map<string, SideLabel>();
  for (const s of sides.data ?? []) if (s.matchups?.title) labels.set(s.id, { side: s.name, matchup: s.matchups.title });
  return toRecentPulls(rows, labels, now);
}

// Holds finished results only. A pending read belongs to the request that started it, and the
// hosting runtime never lets a later request wait on it, so each cache miss reads on its own.
const cache = new Map<boolean, { until: number; value: RecentPull[] }>();

/**
 * Short per-instance cache, so a spike costs one small read per instance every few seconds.
 * Failures are never cached and render nothing.
 */
export async function cachedRecentPulls(db: () => RecentPullsDb, live: boolean, now = Date.now()): Promise<RecentPull[]> {
  const hit = cache.get(live);
  if (hit && hit.until > now) return hit.value;
  try {
    const value = await loadRecentPulls(db(), live, now);
    cache.set(live, { until: now + RECENT_PULLS.cacheSeconds * 1000, value });
    return value;
  } catch {
    cache.delete(live);
    return [];
  }
}

export const clearRecentPullsCache = () => cache.clear();
