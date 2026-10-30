/** Shared (browser-safe) share-image definitions. */
export const CARD_SIZES = {
  story: [1080, 1920],
  square: [1080, 1080],
  link: [1200, 630],
} as const;
export type CardSize = keyof typeof CARD_SIZES;
export const CARD_SIZE_LABELS: Record<CardSize, string> = { story: "Story", square: "Square", link: "Link preview" };
export const isCardSize = (s: unknown): s is CardSize => typeof s === "string" && s in CARD_SIZES;

export type CardSide = { name: string; emoji: string; color: string; cents: number };
export type CardInput = {
  kind: "live" | "result";
  /** UTC day (YYYY-MM-DD) the numbers belong to. */
  day: string;
  a: CardSide;
  b: CardSide;
  /** For results: index of the winning side. */
  winner?: 0 | 1 | null;
  pullers?: number;
};

/** Canonical public origin for absolute share-image URLs. */
export const PUBLIC_SITE = "https://tugg.lol";

/** Link-preview images refresh every 5 minutes: the bucket changes the URL crawlers see. */
export const imageBucket = (now = Date.now()) => Math.floor(now / 300000).toString(36);

export const matchupImagePath = (slug: string, size: CardSize = "link") => `/api/public/og/m/${encodeURIComponent(slug)}?size=${size}`;
export const resultImagePath = (id: string, size: CardSize = "link") => `/api/public/og/r/${encodeURIComponent(id)}?size=${size}`;
