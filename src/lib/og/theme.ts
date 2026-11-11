/**
 * The site's real colour tokens (copied verbatim from :root in src/styles.css, checked by a test) and
 * their sRGB values, so share images drawn in pure JS use exactly the colours the page shows.
 */
export const SITE_TOKENS = {
  background: "oklch(0.14 0.01 270)",
  foreground: "oklch(0.97 0.01 100)",
  card: "oklch(0.19 0.012 270)",
  primary: "oklch(0.92 0.2 115)",
  "muted-foreground": "oklch(0.7 0.02 270)",
  accent: "oklch(0.68 0.25 0)",
  border: "oklch(0.3 0.015 270)",
  rope: "oklch(0.78 0.11 70)",
  "rope-dark": "oklch(0.55 0.09 60)",
} as const;
export type SiteToken = keyof typeof SITE_TOKENS;

/** CSS oklch(L C h) → #rrggbb (OKLab → linear sRGB → gamma; out-of-gamut channels are clipped like the browser). */
export function oklchToHex(css: string): string {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(css.trim());
  if (!m) throw new Error(`unsupported colour ${css}`);
  const L = Number(m[1]), C = Number(m[2]), h = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return "#" + lin.map((x) => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255).toString(16).padStart(2, "0")).join("");
}

export const SITE_COLORS = Object.fromEntries(
  Object.entries(SITE_TOKENS).map(([k, v]) => [k, oklchToHex(v)]),
) as Record<SiteToken, string>;
