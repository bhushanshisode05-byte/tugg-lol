/**
 * The one place that maps a side's emoji to its Google Noto Color Emoji artwork. The website loads the SVG, the
 * share-card renderer loads the PNG (it only decodes PNG) of the same code from pinned releases, so a side looks
 * identical on every device and in every shared image.
 *
 * Sources (all on jsDelivr, all pinned):
 * - googlefonts/noto-emoji release v2.051 (Unicode 17.0): svg/ and png/128/ for every emoji except flags,
 *   third_party/region-flags/waved-svg/ for flags (the waved flags the Noto font uses).
 * - The Noto repository ships no PNG flags, so cards take the same waved Noto flags from emoji-datasource-google
 *   (64 px PNGs rendered from Noto Color Emoji).
 */
export const NOTO_VERSION = "v2.051";
export const NOTO_FLAG_PNG_VERSION = "16.0.0";
export const EMOJI_ORIGIN = "https://cdn.jsdelivr.net";
const NOTO = `${EMOJI_ORIGIN}/gh/googlefonts/noto-emoji@${NOTO_VERSION}`;
const FLAG_PNG = `${EMOJI_ORIGIN}/npm/emoji-datasource-google@${NOTO_FLAG_PNG_VERSION}/img/google/64`;

/** Noto's own flag aliases (emoji_aliases.txt): territories that officially fly another flag. */
const FLAG_ALIASES: Record<string, string> = {
  "1f1e7_1f1fb": "1f1f3_1f1f4", // Bouvet Island → Norway
  "1f1e8_1f1f5": "1f1eb_1f1f7", // Clipperton Island → France
  "1f1e9_1f1ec": "1f1ee_1f1f4", // Diego Garcia → British Indian Ocean Territory
  "1f1ea_1f1e6": "1f1ea_1f1f8", // Ceuta & Melilla → Spain
  "1f1ed_1f1f2": "1f1e6_1f1fa", // Heard & McDonald Islands → Australia
  "1f1f2_1f1eb": "1f1eb_1f1f7", // St. Martin → France
  "1f1f8_1f1ef": "1f1f3_1f1f4", // Svalbard & Jan Mayen → Norway
  "1f1fa_1f1f2": "1f1fa_1f1f8", // U.S. Outlying Islands → United States
};
/** Flags Noto deliberately draws as a blank "unknown flag" (unknown_flag_aliases.txt); these stay plain characters. */
const NO_ARTWORK = new Set(["1f1e7_1f1f1", "1f1e7_1f1f6", "1f1f2_1f1f6", "1f1f7_1f1ea", "1f1f9_1f1eb"]);

/** Noto file code: code points in lower-case hex (at least 4 digits) joined by "_", every FE0F dropped. */
export function emojiCode(emoji: string) {
  const code = Array.from(emoji.trim())
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16).padStart(4, "0"))
    .join("_");
  return FLAG_ALIASES[code] ?? code;
}

const RI = "1f1(?:e[6-9a-f]|f[0-9a-f])";
/** Country flags (two regional indicators) and tag-sequence flags such as England, Scotland and Wales. */
const isFlag = (code: string) => new RegExp(`^${RI}_${RI}$`).test(code) || /^1f3f4(?:_e00[2-7][0-9a-f])+$/.test(code);

export function emojiArtUrl(emoji: string, format: "png" | "svg"): string | null {
  const code = emojiCode(emoji);
  if (!code || !/^[0-9a-f_]+$/.test(code) || NO_ARTWORK.has(code)) return null;
  if (isFlag(code))
    return format === "png" ? `${FLAG_PNG}/${code.replace(/_/g, "-")}.png` : `${NOTO}/third_party/region-flags/waved-svg/emoji_u${code}.svg`;
  return format === "png" ? `${NOTO}/png/128/emoji_u${code}.png` : `${NOTO}/svg/emoji_u${code}.svg`;
}

/** Cheap pre-check so plain text (for example "AB") never requests a file Noto cannot have. */
export function looksLikeEmoji(s: string) {
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s);
}
