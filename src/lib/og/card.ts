/** Shared (browser-safe) share-image definitions. */
import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";
import { weekStart } from "@/lib/rounds";

export const CARD_SIZES = {
  story: [1080, 1920],
  square: [1080, 1080],
  link: [1200, 630],
} as const;
export type CardSize = keyof typeof CARD_SIZES;
export const CARD_SIZE_LABELS: Record<CardSize, string> = {
  story: "Story",
  square: "Square",
  link: "Link preview",
};
export const isCardSize = (s: unknown): s is CardSize => typeof s === "string" && s in CARD_SIZES;

export type CardSide = {
  name: string;
  emoji: string;
  color: string;
  cents: number;
  image_id?: string | null;
  image_status?: string | null;
};
export type CardPull = {
  /** Which side was pulled (0 = A, 1 = B). */
  side: 0 | 1;
  /** Number of $1 pulls in this payment line. */
  count: number;
  /** Moderated public display name, or null for the first-person "I". */
  by: string | null;
  /** Matchup title, as on the receipt. */
  title: string;
  /** The pulled side's all-time total right after this pull (cents). */
  allTimeCents: number;
};
/**
 * What an empty live round's card draws instead of "$0 vs $0": the never-resetting all-time score and the previous round.
 * Present only when the current round has no pulls.
 */
export type CardHistory = {
  /** Closed rounds so far (empty ones included). */
  rounds: number;
  winsA: number;
  winsB: number;
  allTimeA: number;
  allTimeB: number;
  /** Previous round: winning side index (null when it had no pulls) and its final totals. */
  last: { winner: 0 | 1 | null; a: number; b: number; tie: boolean } | null;
};
export type CardInput = {
  kind: "live" | "result" | "pull";
  /** UTC day (YYYY-MM-DD) the numbers belong to; for weekly rounds, the Monday that names the week. */
  day: string;
  /** Set for weekly rounds only, so daily cards (and their cached URLs) stay exactly as they were. */
  period?: "week" | undefined;
  a: CardSide;
  b: CardSide;
  /** For results: index of the winning side. */
  winner?: 0 | 1 | null;
  pullers?: number;
  /** For personal pull cards only. */
  pull?: CardPull;
  /** Live cards for an empty round only. */
  history?: CardHistory | undefined;
};

/** Canonical public origin for absolute share-image URLs. */
export const PUBLIC_SITE = "https://tugg.lol";

/** Bump when the drawing code changes so every versioned (immutable) image URL changes too. */
export const CARD_RENDER_VERSION = 4; // 3: Noto Color Emoji (was Twemoji); 4: live/result cards use the site colour tokens
/** Versioned URLs identify their content, so they may be cached for a year. */
export const IMMUTABLE_CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";
/** Unversioned or out-of-date URLs still render current data but are only briefly cached. */
export const SHORT_CACHE = "public, max-age=60, s-maxage=60";
/** Optional side pictures can be hidden after a report, so cards drawing one are never cached for long. */
export const PICTURE_CACHE = "public, max-age=300, s-maxage=300";

type MatchupLike = {
  sides: { id?: string; name: string; emoji: string; color: string; image_id?: string | null; image_status?: string | null; all_time_cents?: number; wins?: number }[];
  round: { starts_at?: string | null; total_a_cents: number; total_b_cents: number; round_length?: string | null } | null;
  history?: {
    rounds: number;
    last: { winner_side_id: string | null; note: string | null; total_a_cents: number; total_b_cents: number } | null;
  } | null;
};
type ResultLike = {
  ends_at: string;
  starts_at?: string | null | undefined;
  round_length?: string | null | undefined;
  pullers: number;
  winner_cents: number;
  loser_cents: number;
  winner: MatchupLike["sides"][number] & { position: number };
  loser: MatchupLike["sides"][number];
};

const side = (s: MatchupLike["sides"][number], cents: number): CardSide => ({
  name: s.name,
  emoji: s.emoji,
  color: s.color,
  cents,
  image_id: s.image_id ?? null,
  image_status: s.image_status ?? null,
});

/** Exactly what the live matchup card draws. Used by the image route and by every link to it. */
export function matchupCardInput(m: MatchupLike, today = new Date().toISOString()): CardInput | null {
  const [a, b] = m.sides;
  if (!a || !b) return null;
  const start = m.round?.starts_at ?? today;
  const weekly = m.round?.round_length === "weekly";
  const ca = Number(m.round?.total_a_cents ?? 0), cb = Number(m.round?.total_b_cents ?? 0);
  return {
    kind: "live",
    day: weekly ? weekStart(start) : start.slice(0, 10),
    ...(weekly ? { period: "week" as const } : {}),
    a: side(a, ca),
    b: side(b, cb),
    ...(ca === 0 && cb === 0 ? { history: cardHistory(m) } : {}),
  };
}

/** The all-time score and previous round, drawn when the live round is empty. */
export function cardHistory(m: MatchupLike): CardHistory {
  const [a, b] = m.sides;
  const last = m.history?.last ?? null;
  const la = Number(last?.total_a_cents ?? 0), lb = Number(last?.total_b_cents ?? 0);
  const winner = !last || !last.winner_side_id || la + lb === 0 ? null : last.winner_side_id === a?.id ? 0 : last.winner_side_id === b?.id ? 1 : null;
  return {
    rounds: Number(m.history?.rounds ?? 0),
    winsA: Number(a?.wins ?? 0),
    winsB: Number(b?.wins ?? 0),
    allTimeA: Number(a?.all_time_cents ?? 0),
    allTimeB: Number(b?.all_time_cents ?? 0),
    last: last ? { winner, a: la, b: lb, tie: last.note === "tie" } : null,
  };
}

/** Exactly what the final result card draws. */
export function resultCardInput(c: ResultLike): CardInput {
  const winnerIsA = c.winner.position === 0;
  const [a, b] = winnerIsA ? [c.winner, c.loser] : [c.loser, c.winner];
  const weekly = c.round_length === "weekly" && !!c.starts_at;
  return {
    kind: "result",
    day: weekly ? weekStart(c.starts_at!) : new Date(new Date(c.ends_at).getTime() - 1000).toISOString().slice(0, 10),
    ...(weekly ? { period: "week" as const } : {}),
    a: side(a, winnerIsA ? c.winner_cents : c.loser_cents),
    b: side(b, winnerIsA ? c.loser_cents : c.winner_cents),
    winner: winnerIsA ? 0 : 1,
    pullers: c.pullers,
  };
}

/** 32-bit FNV-1a, base36. Not security-sensitive: only a cache key. */
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Cache key for a card: "<A cents>-<B cents>-<fingerprint>", e.g. "0-2500-1x9k2f".
 * The totals change whenever the score moves; the fingerprint covers everything else the card draws
 * (round day, names, emoji, colours, pictures, winner, pullers, renderer version).
 */
export function cardVersion(input: CardInput) {
  const sideKey = (s: CardSide) => [s.name, s.emoji, s.color, s.image_id ?? "", s.image_status ?? ""].join("\u0001");
  const base = [CARD_RENDER_VERSION, input.kind, input.day, sideKey(input.a), sideKey(input.b), input.winner ?? "", input.pullers ?? ""];
  // Weekly rounds and empty-round history are appended only when present, so existing daily URLs keep their tokens.
  const extra = [input.period ?? "", input.history ? JSON.stringify(input.history) : ""];
  const fingerprint = fnv((extra.some(Boolean) ? [...base, ...extra] : base).join("\u0002"));
  return `${Math.round(input.a.cents)}-${Math.round(input.b.cents)}-${fingerprint}`;
}

/** True when the renderer would draw an optional side picture (never true while pictures are switched off). */
export const drawsPicture = (input: CardInput) =>
  SIDE_IMAGES_ENABLED && [input.a, input.b].some((s) => Boolean(s.image_id) && s.image_status === "ok");

/** Cache header for a versioned card route: hard only when the URL's token matches what is being drawn. */
export function versionedCache(input: CardInput, token: string | null, unversioned = SHORT_CACHE) {
  if (!token) return unversioned;
  if (token !== cardVersion(input)) return SHORT_CACHE;
  return drawsPicture(input) ? PICTURE_CACHE : IMMUTABLE_CACHE;
}

/** Payment/order style references (pay_…, uuids, long mixed letter-digit tokens) are never drawn. */
const looksLikeReference = (name: string) =>
  /\b(pay|pdt|cks|cus|ord|txn|sub|ref|gid)_[a-z0-9]/i.test(name) ||
  /[0-9a-f]{8}-[0-9a-f]{4}/i.test(name) ||
  name.split(" ").some((w) => w.length >= 12 && /\d/.test(w) && /[a-z]/i.test(w));
const BLOCKED_NAME = /@|https?:|www\.|\.(com|net|org|io|lol|app|co|me|xyz|gg|ly)\b|\b\d{6,}\b/i;
/**
 * Public credit for a pull card: the already-moderated display name, tidied for drawing.
 * Anything that looks like an email, link, long number or private reference falls back to the first-person "I".
 */
export function cardDisplayName(raw: string | null | undefined): string | null {
  // eslint-disable-next-line no-control-regex
  const name = (raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40 || BLOCKED_NAME.test(name) || looksLikeReference(name)) return null;
  if (/^(anonymous|anon|i|me)$/i.test(name)) return null;
  return name;
}

/** First-person share text form: "I pulled 25 for Ronaldo" or "Harry pulled 25 for Ronaldo". */
export const pullHeadline = (by: string | null, count: number, sideName: string) =>
  `${by ?? "I"} pulled ${count} for ${sideName.trim()}`;

/** The receipt's own headline, used verbatim on screen and on the personal pull card. */
export const receiptHeadline = (count: number, sideName: string) => `You pulled ${count} for ${sideName.trim()}!`;
/** Display-name credit under the receipt headline on the pull card. */
export const receiptCredit = (by: string) => `Pulled by ${by}`;

const q = (size: CardSize, v?: string | null) => `?size=${size}${v ? `&v=${encodeURIComponent(v)}` : ""}`;
export const matchupImagePath = (slug: string, size: CardSize = "link", v?: string | null) =>
  `/api/public/og/m/${encodeURIComponent(slug)}${q(size, v)}`;
export const resultImagePath = (id: string, size: CardSize = "link", v?: string | null) =>
  `/api/public/og/r/${encodeURIComponent(id)}${q(size, v)}`;
/**
 * Bump when the pull card's design changes. Pull cards are permanent snapshots cached for a year, so the
 * design number is part of the URL; the route ignores it and always draws the current design.
 */
export const PULL_CARD_DESIGN = 3; // 3: Noto Color Emoji artwork
/** Public page showing one pull's card; linked from that buyer's receipt email. Keyed only by the public pull id. */
export const pullPagePath = (pullId: string) => `/pull/${encodeURIComponent(pullId)}`;
/** Personal pull cards are permanent snapshots keyed by the public pull id; no score token needed. */
export const pullImagePath = (pullId: string, size: CardSize = "link") =>
  `/api/public/og/p/${encodeURIComponent(pullId)}?size=${size}&d=${PULL_CARD_DESIGN}`;
