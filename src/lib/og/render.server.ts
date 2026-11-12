import opentype from "opentype.js";
import displayFontUrl from "@/assets/fonts/display-800.ttf?inline";
import monoFontUrl from "@/assets/fonts/mono-800.ttf?inline";
import regularFontUrl from "@/assets/fonts/display-400.ttf?inline";
import semiboldFontUrl from "@/assets/fonts/display-600.ttf?inline";
import { Raster, hex, flattenCommands, encodePng, decodePng, type RGBA } from "./raster";
import { CARD_SIZES, type CardInput, type CardSize } from "./card";
import { ropePosition, usd } from "@/components/tugg/Rope";
import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";
import { emojiCode, twemojiUrl } from "@/lib/twemoji";

// Live and result card palette. These cards keep their established colours so their cached images stay valid;
// the personal pull card uses the site's real tokens from ./theme instead.
const BG = "#111218";
const FG = "#f6f6ee";
const MUTED = "#9fa1b3";
const LIME = "#e2ff3d";
const PINK = "#ff2e7a";
const ROPE = "#d8b37a";
const ROPE_DARK = "#a77f48";

type Font = opentype.Font;
let fonts: { display: Font; mono: Font; regular: Font; semibold: Font } | null = null;
function dataUrlToBuffer(u: string) {
  const b64 = u.slice(u.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
export function getFonts() {
  if (!fonts)
    fonts = {
      display: opentype.parse(dataUrlToBuffer(displayFontUrl)),
      mono: opentype.parse(dataUrlToBuffer(monoFontUrl)),
      regular: opentype.parse(dataUrlToBuffer(regularFontUrl)),
      semibold: opentype.parse(dataUrlToBuffer(semiboldFontUrl)),
    };
  return fonts;
}

const emojiCache = new Map<string, Awaited<ReturnType<typeof decodePng>>>();
export { emojiCode };
async function loadEmoji(emoji: string) {
  const code = emojiCode(emoji);
  const url = twemojiUrl(emoji, "png");
  if (!url) return null;
  if (emojiCache.has(code)) return emojiCache.get(code) ?? null;
  let img: Awaited<ReturnType<typeof decodePng>> = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) img = await decodePng(new Uint8Array(await res.arrayBuffer()));
  } catch {
    img = null;
  }
  if (emojiCache.size > 300) emojiCache.clear();
  emojiCache.set(code, img);
  return img;
}

export async function loadSide(side: import("./card").CardSide) {
  if (SIDE_IMAGES_ENABLED && side.image_id && side.image_status === "ok") {
    try {
      const { loadRendererSideImage } = await import("../side-image-render.server");
      const img = await loadRendererSideImage(side.image_id);
      if (img) return img;
    } catch {
      /* Preserve emoji-only rendering on any image failure. */
    }
  }
  return side.emoji ? loadEmoji(side.emoji) : null;
}

/** Side colours are user-chosen; lift dark ones so names stay readable on the dark card. */
export function readable(color: string): RGBA {
  const [r, g, b] = hex(color);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum >= 0.38) return [r, g, b, 1];
  const t = Math.min(0.75, (0.38 - lum) / 0.38 + 0.25);
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t, 1];
}

const width = (f: Font, text: string, size: number) =>
  f.getAdvanceWidth(text, size, { kerning: true });

/** Largest size ≤ max that fits; below min, truncate with an ellipsis so nothing overflows. */
export function fit(f: Font, text: string, maxW: number, max: number, min: number) {
  let size = max;
  const w = width(f, text, max);
  if (w > maxW) size = Math.max(min, ((max * maxW) / w) * 0.98);
  let t = text;
  while (t.length > 1 && width(f, t, size) > maxW) t = t.slice(0, -2).trimEnd() + "…";
  return { text: t, size, w: width(f, t, size) };
}

function text(r: Raster, f: Font, s: string, x: number, y: number, size: number, c: RGBA) {
  r.fill(flattenCommands(f.getPath(s, x, y, size, { kerning: true }).commands as never), c);
}

/** True when the font can draw every visible character (no empty boxes in a public image). */
export function drawable(f: Pick<Font, "charToGlyphIndex">, s: string) {
  return Array.from(s).every((ch) => /\s/.test(ch) || f.charToGlyphIndex(ch) > 0);
}

type Metrics = {
  pad: number;
  header: number;
  headerY: number;
  titleTop: number;
  titleBottom: number;
  titleMax: number;
  titleMin: number;
  emojiY: number;
  emoji: number;
  nameY: number;
  name: number;
  totalY: number;
  total: number;
  ropeY: number;
  rope: number;
  pullY: number;
  pull: number;
  brandY: number;
  brand: number;
  centered: boolean;
};
const METRICS: Record<CardSize, Metrics> = {
  link: {
    pad: 56,
    header: 22,
    headerY: 74,
    titleTop: 100,
    titleBottom: 250,
    titleMax: 84,
    titleMin: 34,
    emojiY: 268,
    emoji: 76,
    nameY: 388,
    name: 38,
    totalY: 454,
    total: 62,
    ropeY: 524,
    rope: 22,
    pullY: 590,
    pull: 32,
    brandY: 590,
    brand: 28,
    centered: false,
  },
  square: {
    pad: 72,
    header: 30,
    headerY: 116,
    titleTop: 160,
    titleBottom: 420,
    titleMax: 120,
    titleMin: 46,
    emojiY: 460,
    emoji: 130,
    nameY: 670,
    name: 54,
    totalY: 770,
    total: 92,
    ropeY: 872,
    rope: 30,
    pullY: 966,
    pull: 48,
    brandY: 1030,
    brand: 34,
    centered: true,
  },
  story: {
    pad: 80,
    header: 38,
    headerY: 250,
    titleTop: 320,
    titleBottom: 760,
    titleMax: 150,
    titleMin: 56,
    emojiY: 780,
    emoji: 220,
    nameY: 1100,
    name: 72,
    totalY: 1240,
    total: 124,
    ropeY: 1390,
    rope: 40,
    pullY: 1580,
    pull: 76,
    brandY: 1760,
    brand: 52,
    centered: true,
  },
};

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`)
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();

export async function renderCard(input: CardInput, size: CardSize): Promise<Uint8Array> {
  // The personal pull card mirrors the on-screen receipt; it has its own layout.
  if (input.kind === "pull" && input.pull) return (await import("./pull-card.server")).renderPullCard(input, size);
  const [W, H] = CARD_SIZES[size];
  const m = METRICS[size];
  const { display, mono } = getFonts();
  const r = new Raster(W, H, hex(BG));
  const ca = readable(input.a.color),
    cb = readable(input.b.color);

  // Each side's half carries a soft wash of its own colour.
  r.rect(0, 0, W / 2, H, [...hex(input.a.color).slice(0, 3), 0.13] as RGBA);
  r.rect(W / 2, 0, W / 2, H, [...hex(input.b.color).slice(0, 3), 0.13] as RGBA);
  r.rect(0, 0, W / 2, Math.max(8, m.rope / 3), [...ca.slice(0, 3), 1] as RGBA);
  r.rect(W / 2, 0, W / 2, Math.max(8, m.rope / 3), [...cb.slice(0, 3), 1] as RGBA);

  const inner = W - m.pad * 2;
  const week = input.period === "week";
  const header =
    input.kind === "live"
      ? `LIVE ROUND · ${week ? "WEEK OF " : ""}${fmtDay(input.day)} · UTC`
      : week
        ? `FINAL RESULT · WEEK OF ${fmtDay(input.day)} · UTC`
        : `FINAL RESULT · ROUND OF ${fmtDay(input.day)} · UTC`;
  const history = input.kind === "live" ? input.history : undefined;
  const hd = fit(mono, header, inner, m.header, m.header * 0.6);
  text(r, mono, hd.text, m.centered ? (W - hd.w) / 2 : m.pad, m.headerY, hd.size, hex(MUTED));

  // Title "A vs B": one line when it fits large enough, otherwise stacked lines.
  const A = input.a.name.trim(),
    B = input.b.name.trim();
  const block = m.titleBottom - m.titleTop;
  {
  const one = `${A} vs ${B}`;
  const oneW = width(display, one, m.titleMax);
  const oneSize = Math.min(m.titleMax, (m.titleMax * inner) / oneW);
  if (oneSize >= m.titleMax * 0.62) {
    const sz = oneSize;
    const total = width(display, one, sz);
    let x = m.centered ? (W - total) / 2 : m.pad;
    const y = m.titleTop + block / 2 + sz * 0.36;
    for (const [seg, c] of [
      [A, ca],
      [" vs ", hex(FG)],
      [B, cb],
    ] as const) {
      text(r, display, seg, x, y, sz, c);
      x += width(display, seg, sz);
    }
  } else {
    const lines: [string, RGBA][] = [
      [A, ca],
      ["vs", hex(MUTED)],
      [B, cb],
    ];
    const lineMax = Math.min(m.titleMax, block / 2.6);
    const fitted = lines.map(([s, c], i) => ({
      ...fit(display, s, inner, i === 1 ? lineMax * 0.55 : lineMax, m.titleMin),
      c,
    }));
    const heights = fitted.map((f) => f.size * 0.92);
    let y = m.titleTop + (block - heights.reduce((a, b) => a + b, 0)) / 2;
    for (let i = 0; i < fitted.length; i++) {
      const f = fitted[i]!;
      y += heights[i]!;
      text(r, display, f.text, m.centered ? (W - f.w) / 2 : m.pad, y - f.size * 0.12, f.size, f.c);
    }
  }
  }

  // Side columns: emoji, name, current total — A on the left, B on the right.
  const colW = (inner - m.pad) / 2;
  const [ea, eb] = await Promise.all([loadSide(input.a), loadSide(input.b)]);
  const sides = [
    { s: input.a, c: ca, e: ea, x: m.pad, align: "left" as const },
    { s: input.b, c: cb, e: eb, x: W - m.pad - colW, align: "right" as const },
  ];
  for (const [i, side] of sides.entries()) {
    const ax = (w: number) =>
      m.centered ? side.x + (colW - w) / 2 : side.align === "left" ? side.x : side.x + colW - w;
    if (side.e) r.image(side.e, ax(m.emoji), m.emojiY, m.emoji, m.emoji);
    const label =
      input.kind === "result" && input.winner === i ? "WINNER" : null;
    if (label) {
      const ls = m.name * 0.5;
      const lw = width(mono, label, ls) + ls * 1.4;
      let bx = ax(lw),
        ly = m.emojiY + (side.e ? m.emoji - ls * 1.2 : 0);
      if (side.e && !m.centered) {
        ly = m.emojiY + m.emoji / 2 - ls;
        bx = side.align === "left" ? side.x + m.emoji + ls : side.x + colW - m.emoji - ls - lw;
      }
      r.roundRect(bx, ly, lw, ls * 2, ls, hex(LIME));
      text(r, mono, label, bx + ls * 0.7, ly + ls * 1.38, ls, hex(BG));
    }
    const nm = fit(display, side.s.name, colW, m.name, m.name * 0.55);
    text(r, display, nm.text, ax(nm.w), m.nameY, nm.size, side.c);
    if (history) {
      // Empty round: each side's all-time total (never resets) instead of a round total of $0.
      if (history.allTimeA + history.allTimeB > 0) {
        const val = usd(i === 0 ? history.allTimeA : history.allTimeB), suf = " all-time";
        let vs = m.total * 0.8, ss = m.total * 0.36;
        let w = width(mono, val, vs) + width(display, suf, ss);
        if (w > colW) {
          const k = (colW / w) * 0.98;
          vs *= k;
          ss *= k;
          w = width(mono, val, vs) + width(display, suf, ss);
        }
        const x = ax(w);
        text(r, mono, val, x, m.totalY, vs, hex(FG));
        text(r, display, suf, x + width(mono, val, vs), m.totalY, ss, hex(MUTED));
      }
    } else {
      const tt = fit(mono, usd(side.s.cents), colW, m.total, m.total * 0.2);
      text(r, mono, tt.text, ax(tt.w), m.totalY, tt.size, hex(FG));
    }
  }

  if (history) {
    drawHistory(r, history, A, B, m, W, inner);
    const cta = fit(display, `Be the first to pull ${week ? "this week" : "today"} →`, m.centered ? inner : inner * 0.68, m.pull, m.pull * 0.55);
    text(r, display, cta.text, m.centered ? (W - cta.w) / 2 : m.pad, m.pullY, cta.size, hex(LIME));
    const bw = width(mono, "tugg.lol", m.brand);
    text(r, mono, "tugg.lol", m.centered ? (W - bw) / 2 : W - m.pad - bw, m.brandY, m.brand, hex(FG));
    return encodePng(r);
  }

  // Rope with the flag at the real current position (same formula as the site).
  const t = m.rope;
  const rx0 = m.pad + t,
    rx1 = W - m.pad - t,
    ry = m.ropeY;
  r.roundRect(rx0, ry - t / 2, rx1 - rx0, t, t / 2, hex(ROPE));
  for (let x = rx0 + t; x < rx1 - t * 1.4; x += t * 0.9)
    r.fill(
      [
        [
          x,
          ry - t / 2,
          x + t * 0.35,
          ry - t / 2,
          x + t * 0.05,
          ry + t / 2,
          x - t * 0.3,
          ry + t / 2,
        ],
      ],
      hex(ROPE_DARK, 0.8),
    );
  for (let y = ry - t * 1.6; y < ry + t * 1.6; y += t * 0.5)
    r.rect(W / 2 - 1.5, y, 3, t * 0.28, hex(MUTED, 0.6));
  r.circle(rx0, ry, t * 0.95, [...ca.slice(0, 3), 1] as RGBA);
  r.circle(rx1, ry, t * 0.95, [...cb.slice(0, 3), 1] as RGBA);
  const fx = rx0 + ((rx1 - rx0) * ropePosition(input.a.cents, input.b.cents)) / 100;
  const pole = t * 2.2;
  r.rect(fx - t * 0.13, ry - pole, t * 0.26, pole + t * 0.9, hex(FG));
  r.fill(
    [
      [
        fx + t * 0.13,
        ry - pole,
        fx + t * 1.6,
        ry - pole + t * 0.55,
        fx + t * 0.13,
        ry - pole + t * 1.1,
      ],
    ],
    hex(PINK),
  );

  // Call to action + domain.
  const cta =
    input.kind !== "result"
      ? "Pull your side →"
      : `Final totals · ${input.pullers ?? 0} puller${input.pullers === 1 ? "" : "s"} · Pull your side ${week ? "this week" : "today"}`;
  const ct = fit(display, cta, m.centered ? inner : inner * 0.68, m.pull, m.pull * 0.55);
  text(r, display, ct.text, m.centered ? (W - ct.w) / 2 : m.pad, m.pullY, ct.size, hex(LIME));
  const bw = width(mono, "tugg.lol", m.brand);
  text(r, mono, "tugg.lol", m.centered ? (W - bw) / 2 : W - m.pad - bw, m.brandY, m.brand, hex(FG));

  return encodePng(r);
}

/** Two lines where the rope would be: the previous round's result and the never-resetting round record. */
function drawHistory(r: Raster, h: NonNullable<CardInput["history"]>, A: string, B: string, m: Metrics, W: number, inner: number) {
  const { display } = getFonts();
  const dash = drawable(display, "—") ? "—" : "-";
  const names = [A, B];
  const last = h.last;
  const line1 = !last
    ? "First round · no pulls yet"
    : last.winner === null
      ? "Last round: no pulls"
      : `Last round: ${names[last.winner]} won ${usd(Math.max(last.a, last.b))} to ${usd(Math.min(last.a, last.b))}${last.tie ? " (tie-break)" : ""}`;
  const line2 = h.rounds
    ? `Rounds won: ${A} ${h.winsA} ${dash} ${B} ${h.winsB} over ${h.rounds} round${h.rounds === 1 ? "" : "s"}`
    : "";
  const maxW = m.centered ? inner : inner * 0.92;
  const y1 = m.ropeY - m.rope;
  const l1 = fit(display, line1, maxW, m.pull * 0.95, m.pull * 0.45);
  text(r, display, l1.text, m.centered ? (W - l1.w) / 2 : m.pad, y1, l1.size, hex(FG));
  if (line2) {
    const l2 = fit(display, line2, maxW, m.header * 1.05, m.header * 0.6);
    text(r, display, l2.text, m.centered ? (W - l2.w) / 2 : m.pad, y1 + l1.size * 1.2, l2.size, hex(MUTED));
  }
}
