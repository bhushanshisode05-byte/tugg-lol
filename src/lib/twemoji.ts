/**
 * The one place that maps a side's emoji to its Twemoji artwork. The share-card renderer loads the 72×72 PNG
 * (it decodes PNG), the website loads the SVG of the same file name from the same pinned release, so a side
 * looks identical on every device and in every shared image.
 */
export const TWEMOJI_VERSION = "15.1.0";
export const TWEMOJI_ORIGIN = "https://cdn.jsdelivr.net";
const BASE = `${TWEMOJI_ORIGIN}/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets`;

/** Twemoji file name: code points in hex joined by "-"; FE0F is dropped unless the sequence uses ZWJ. */
export function emojiCode(emoji: string) {
  const cps = Array.from(emoji.trim()).map((c) => c.codePointAt(0)!.toString(16));
  const zwj = cps.includes("200d");
  return cps.filter((c) => zwj || c !== "fe0f").join("-");
}

export function twemojiUrl(emoji: string, format: "png" | "svg"): string | null {
  const code = emojiCode(emoji);
  if (!code || !/^[0-9a-f-]+$/.test(code)) return null;
  return format === "png" ? `${BASE}/72x72/${code}.png` : `${BASE}/svg/${code}.svg`;
}

/** Cheap pre-check so plain text (for example "AB") never requests a file Twemoji cannot have. */
export function looksLikeEmoji(s: string) {
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s);
}
