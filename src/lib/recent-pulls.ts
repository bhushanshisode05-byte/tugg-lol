/**
 * Recent-pulls ticker: browser-safe shape, rules and formatting.
 * Every row is a real recorded pull (rows only exist after a verified payment). Nothing here invents,
 * pads or rounds activity; an empty list means the ticker is not rendered at all.
 */
import { cardDisplayName } from "./og/card";

export const RECENT_PULLS = {
  /** Rows shown, newest first. */
  limit: 5,
  /** Only pulls from this many hours back. */
  windowHours: 48,
  /** Site-wide feed cache per server instance. */
  cacheSeconds: 15,
} as const;

/** The only fields the ticker may ever expose. Tests pin this exact key set. */
export type RecentPull = {
  /** Moderated display name as given, or null when none was given (rendered as "Someone"). */
  name: string | null;
  /** Country name from the stored billing country code, or null. Never guessed. */
  country: string | null;
  side: string;
  matchup: string;
  /** Pull count (each pull is $1). */
  pulls: number;
  /** ISO timestamp of the recorded pull. */
  at: string;
};
export const RECENT_PULL_KEYS = ["at", "country", "matchup", "name", "pulls", "side"] as const;

/** Source row from the public tugg_recent_pulls function (already live-only on the live site). */
export type RecentPullSource = {
  side_id: string;
  amount_cents: number;
  display_name: string | null;
  country: string | null;
  created_at: string;
};
export type SideLabel = { side: string; matchup: string };

const WINDOW_MS = RECENT_PULLS.windowHours * 3600_000;

let regions: Intl.DisplayNames | null | undefined;
/** English country name for a stored two-letter code; anything else (or an unknown code) gives null. */
export function countryName(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  if (regions === undefined) {
    try {
      regions = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regions = null;
    }
  }
  let name: string | undefined;
  try {
    name = regions?.of(c);
  } catch {
    name = undefined;
  }
  return name && name !== c && !/unknown/i.test(name) ? name : null;
}

/** Newest first, last 48 hours only, at most five. */
export function visibleRecentPulls(pulls: readonly RecentPull[], now: number): RecentPull[] {
  return pulls
    .filter((p) => {
      const t = Date.parse(p.at);
      return Number.isFinite(t) && now - t <= WINDOW_MS;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, RECENT_PULLS.limit);
}

/** Maps public pull rows to ticker rows, picking fields explicitly so the shape can never widen. */
export function toRecentPulls(
  rows: readonly RecentPullSource[],
  labels: ReadonlyMap<string, SideLabel>,
  now: number,
): RecentPull[] {
  const out: RecentPull[] = [];
  for (const r of rows) {
    const label = labels.get(r.side_id);
    const pulls = Math.floor(Number(r.amount_cents) / 100);
    const t = Date.parse(r.created_at);
    if (!label || !(pulls >= 1) || !Number.isFinite(t)) continue;
    out.push({
      name: cardDisplayName(r.display_name),
      country: countryName(r.country),
      side: label.side,
      matchup: label.matchup,
      pulls,
      at: new Date(t).toISOString(),
    });
  }
  return visibleRecentPulls(out, now);
}

/** Honest relative time, always rounded down: under a minute is "just now", then whole minutes, then whole hours. */
export function relativeTime(at: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} hr ago`;
}

/** "Someone", "RopeKing" or "Someone in Germany". */
export const pullerLabel = (p: Pick<RecentPull, "name" | "country">) =>
  `${p.name ?? "Someone"}${p.country ? ` in ${p.country}` : ""}`;
