import type opentype from "opentype.js";
import { Raster, hex, flattenCommands, encodePng, type RGBA } from "./raster";
import { CARD_SIZES, receiptCredit, receiptHeadline, type CardInput, type CardSize } from "./card";
import { SITE_COLORS } from "./theme";
import { ropePosition, usd } from "@/components/tugg/Rope";
import { drawable, getFonts, loadSide } from "./render.server";
import { currentRound } from "@/lib/rounds";

/**
 * The personal pull card: the on-screen "Payment confirmed" receipt (src/components/tugg/PaymentReceipt.tsx)
 * redrawn as an image. Every measurement below is the component's own CSS pixel value multiplied by one
 * scale `u`, and every colour is the site's real token, so the image and the screen are the same design.
 */
type Font = opentype.Font;
type Img = Awaited<ReturnType<typeof loadSide>>;

const mix = (top: string, alpha: number, under: RGBA): RGBA => {
  const t = hex(top);
  return [under[0] + (t[0] - under[0]) * alpha, under[1] + (t[1] - under[1]) * alpha, under[2] + (t[2] - under[2]) * alpha, 1];
};
const PAGE = hex(SITE_COLORS.background);
const FG = hex(SITE_COLORS.foreground);
const MUTED = hex(SITE_COLORS["muted-foreground"]);
const PRIMARY = hex(SITE_COLORS.primary);
const OUTER = mix(SITE_COLORS.primary, 0.1, PAGE); // bg-primary/10 on the page background
const INNER = mix(SITE_COLORS.background, 0.6, OUTER); // bg-background/60 inside the receipt
const LINE = hex(SITE_COLORS.border);
const ROPE = hex(SITE_COLORS.rope);
const ROPE_DARK = hex(SITE_COLORS["rope-dark"]);
const FLAG = hex(SITE_COLORS.accent);
const DASH = mix(SITE_COLORS["muted-foreground"], 0.5, INNER);

/** Per size: page margins, the largest scale to try, field columns, headline size (CSS px) and wordmark place. */
const LAYOUT: Record<CardSize, { mx: number; my: number; uMax: number; cols: 2 | 4; headline: number; lines: number; brand: number; brandBelow: boolean }> = {
  link: { mx: 36, my: 28, uMax: 1.6, cols: 4, headline: 34, lines: 2, brand: 13, brandBelow: false },
  square: { mx: 48, my: 44, uMax: 2.3, cols: 2, headline: 42, lines: 3, brand: 44, brandBelow: true },
  story: { mx: 56, my: 120, uMax: 2.7, cols: 2, headline: 50, lines: 3, brand: 64, brandBelow: true },
};

type Seg = { t: string; f: Font; c: RGBA };
type Op = (r: Raster, ox: number, oy: number) => void;
const opts = (ls = 0) => ({ kerning: true, letterSpacing: ls });
const adv = (f: Font, s: string, size: number, ls = 0) => f.getAdvanceWidth(s, size, opts(ls));
const ascent = (f: Font) => f.ascender / f.unitsPerEm;
const content = (f: Font) => (f.ascender - f.descender) / f.unitsPerEm;
/** Baseline for text of `size` centred in a CSS line box of height `lh` starting at `top` (as browsers do). */
const baseline = (f: Font, size: number, top: number, lh: number) => top + (lh - content(f) * size) / 2 + ascent(f) * size;
function draw(r: Raster, f: Font, s: string, x: number, y: number, size: number, c: RGBA, ls = 0) {
  r.fill(flattenCommands(f.getPath(s, x, y, size, opts(ls)).commands as never), c);
}
/** Shorten with an ellipsis until it fits. */
function clip(f: Font, s: string, maxW: number, size: number, ls = 0) {
  let t = s;
  while (t.length > 1 && adv(f, t, size, ls) > maxW) t = t.slice(0, -2).trimEnd() + "…";
  return t;
}

/** Greedy word wrap over styled segments; the last allowed line is ellipsised. */
function wrap(segs: Seg[], size: number, maxW: number, maxLines: number, ls = 0): Seg[][] {
  const words: Seg[] = [];
  for (const s of segs) for (const w of s.t.split(/(?<= )/)) if (w) words.push({ ...s, t: w });
  const lines: Seg[][] = [[]];
  let x = 0;
  for (const w of words) {
    const line = lines[lines.length - 1]!;
    const ww = adv(w.f, w.t.trimEnd(), size, ls);
    if (line.length && x + ww > maxW) {
      if (lines.length === maxLines) {
        line.push(w);
        break;
      }
      lines.push([w]);
      x = adv(w.f, w.t, size, ls);
    } else {
      line.push(w);
      x += adv(w.f, w.t, size, ls);
    }
  }
  // Fit the last line (and any single over-long word) with an ellipsis.
  return lines.map((line) => {
    const out: Seg[] = [];
    let used = 0;
    for (const [i, s] of line.entries()) {
      const t = i === line.length - 1 ? s.t.trimEnd() : s.t;
      const w = adv(s.f, t, size, ls);
      if (used + w <= maxW) {
        out.push({ ...s, t });
        used += w;
      } else {
        out.push({ ...s, t: clip(s.f, t + "…", maxW - used, size, ls) });
        break;
      }
    }
    return out;
  });
}
const lineWidth = (line: Seg[], size: number, ls = 0) => line.reduce((n, s) => n + adv(s.f, s.t, size, ls), 0);
function drawLine(r: Raster, line: Seg[], x: number, y: number, size: number, ls = 0) {
  for (const s of line) {
    draw(r, s.f, s.t, x, y, size, s.c, ls);
    x += adv(s.f, s.t, size, ls);
  }
}

type Facts = {
  label: string;
  headline: string;
  credit: string | null;
  fields: { dt: string; dd: string; mono: boolean }[];
  title: string;
  sideLine: string;
  sideEmoji: Img;
  emojiA: Img;
  emojiB: Img;
  pos: number;
  summary: { strong: string; rest: string };
};

/** Lays the receipt out at scale `u` and returns its height plus the drawing steps. */
function layout(f: ReturnType<typeof getFonts>, facts: Facts, size: CardSize, cardW: number, u: number) {
  const L = LAYOUT[size];
  const ops: Op[] = [];
  const bw = 2 * u, pad = 20 * u;
  const x0 = bw + pad, innerW = cardW - 2 * x0;
  let y = bw + pad;

  // Small uppercase label (text-xs font-bold uppercase tracking-widest text-muted-foreground) + inline wordmark on the link size.
  const labelSize = 12 * u, labelLh = 16 * u;
  {
    const top = y;
    const brandW = L.brandBelow ? 0 : adv(f.mono, "tugg.lol", L.brand * u);
    const label = clip(f.display, facts.label, innerW - brandW - 16 * u, labelSize, 0.1);
    ops.push((r, ox, oy) => {
      draw(r, f.display, label, ox + x0, oy + baseline(f.display, labelSize, top, labelLh), labelSize, MUTED, 0.1);
      if (!L.brandBelow) draw(r, f.mono, "tugg.lol", ox + x0 + innerW - brandW, oy + baseline(f.mono, L.brand * u, top, labelLh), L.brand * u, FG);
    });
    y += labelLh;
  }

  // Headline (font-display text-2xl font-extrabold leading-tight, -0.03em), larger here so it reads at a glance.
  {
    let hs = L.headline * u;
    // The site sets h3 at -0.03em on a small optical size; the large 96pt cut drawn here is already tighter.
    const ls = -0.012;
    let lines = wrap([{ t: facts.headline, f: f.display, c: FG }], hs, innerW, L.lines, ls);
    // Never cut the headline: shrink until it fits on the allowed lines.
    while (hs > 18 * u && (lines.some((l) => l.some((s) => s.t.endsWith("…"))) || lines.length > L.lines)) {
      hs *= 0.94;
      lines = wrap([{ t: facts.headline, f: f.display, c: FG }], hs, innerW, L.lines, ls);
    }
    const lh = hs * 1.12;
    const top = y;
    ops.push((r, ox, oy) => lines.forEach((l, i) => drawLine(r, l, ox + x0, oy + baseline(f.display, hs, top + i * lh, lh), hs, ls)));
    y += lh * lines.length;
  }
  if (facts.credit) {
    const s = 14 * u, lh = 20 * u, top = y + 2 * u;
    const t = clip(f.semibold, facts.credit, innerW, s);
    ops.push((r, ox, oy) => draw(r, f.semibold, t, ox + x0, oy + baseline(f.semibold, s, top, lh), s, MUTED));
    y += lh + 2 * u;
  }
  y += 16 * u; // gap-4

  // The four labelled fields (dt text-sm muted; dd font-mono text-lg font-bold or font-semibold).
  {
    const gap = 12 * u, cols = L.cols;
    const colW = (innerW - gap * (cols - 1)) / cols;
    const rows = Math.ceil(facts.fields.length / cols);
    const dtS = 14 * u, dtLh = 20 * u;
    for (let row = 0; row < rows; row++) {
      const cells = facts.fields.slice(row * cols, row * cols + cols).map((fd) => {
        const font = fd.mono ? f.mono : f.semibold;
        const s = fd.mono ? 18 * u : 14 * u, lh = fd.mono ? 28 * u : 20 * u;
        return { fd, font, s, lh, lines: wrap([{ t: fd.dd, f: font, c: FG }], s, colW, fd.mono ? 1 : 2), dt: clip(f.regular, fd.dt, colW, dtS) };
      });
      const top = y;
      const rowH = dtLh + Math.max(...cells.map((c) => c.lh * c.lines.length));
      ops.push((r, ox, oy) =>
        cells.forEach((c, i) => {
          const cx = ox + x0 + i * (colW + gap);
          draw(r, f.regular, c.dt, cx, oy + baseline(f.regular, dtS, top, dtLh), dtS, MUTED);
          c.lines.forEach((l, k) => drawLine(r, l, cx, oy + baseline(c.font, c.s, top + dtLh + k * c.lh, c.lh), c.s));
        }),
      );
      y += rowH + (row < rows - 1 ? gap : 0);
    }
  }
  y += 16 * u; // mt-4

  // Inner panel (rounded-xl border border-border bg-background/60 p-3).
  {
    const top = y, ib = 1 * u, ip = 12 * u;
    const px = x0, pw = innerW;
    const cx = px + ib + ip, cw = pw - 2 * (ib + ip);
    let iy = top + ib + ip;
    const tS = 12 * u, tLh = 16 * u;
    const titleTop = iy;
    const title = clip(f.display, facts.title.toUpperCase(), cw, tS, 0.1);
    iy += tLh;
    // Side line: small avatar (h-7 w-7, emoji text-xl) + "Messi · 25 pulls" (font-semibold, base).
    const sTop = iy, sLh = 28 * u, sS = 16 * u, av = 28 * u, emo = 20 * u;
    const textX = facts.sideEmoji ? av + 4 * u : 0;
    const sideLine = clip(f.semibold, facts.sideLine, cw - textX, sS);
    iy += sLh + 8 * u; // mt-2
    const ropeTop = iy, ropeH = 80 * u;
    iy += ropeH + 4 * u; // mt-1
    const sumS = 14 * u, sumLh = 20 * u, sumTop = iy;
    const sum = wrap(
      [{ t: facts.summary.strong, f: f.semibold, c: FG }, { t: facts.summary.rest, f: f.regular, c: MUTED }],
      sumS, cw, 4,
    );
    iy += sumLh * sum.length + ip + ib;
    const ph = iy - top;
    ops.push((r, ox, oy) => {
      r.roundRect(ox + px, oy + top, pw, ph, 20 * u, LINE);
      r.roundRect(ox + px + ib, oy + top + ib, pw - 2 * ib, ph - 2 * ib, 20 * u - ib, INNER);
      draw(r, f.display, title, ox + cx, oy + baseline(f.display, tS, titleTop, tLh), tS, MUTED, 0.1);
      if (facts.sideEmoji) r.image(facts.sideEmoji, ox + cx + (av - emo) / 2, oy + sTop + (sLh - emo) / 2, emo, emo);
      draw(r, f.semibold, sideLine, ox + cx + textX, oy + baseline(f.semibold, sS, sTop, sLh), sS, FG);
      drawRope(r, ox + cx, oy + ropeTop, cw, ropeH, u, facts);
      sum.forEach((l, i) => drawLine(r, l, ox + cx, oy + baseline(f.regular, sumS, sumTop + i * sumLh, sumLh), sumS));
    });
    y = iy;
  }
  y += pad + bw;
  return { height: y, ops, bw };
}

/** The site's rope (h-20 row, h-4 rope-texture, dashed centre line, accent flag on a foreground pole, side avatars at the ends). */
function drawRope(r: Raster, x: number, top: number, w: number, h: number, u: number, facts: Facts) {
  const cy = top + h / 2, t = 16 * u;
  r.roundRect(x, cy - t / 2, w, t, t / 2, ROPE);
  // repeating-linear-gradient(115deg, rope 0 8px, rope-dark 8px 11px)
  const dx = Math.sin((115 * Math.PI) / 180), dy = -Math.cos((115 * Math.PI) / 180);
  const period = (11 * u) / dx, dark = (3 * u) / dx, slant = (t * dy) / dx;
  for (let sx = x + t / 2 + (8 * u) / dx; sx < x + w - t / 2 - dark; sx += period)
    r.fill([[sx + slant, cy - t / 2, sx + slant + dark, cy - t / 2, sx + dark, cy + t / 2, sx, cy + t / 2]], ROPE_DARK);
  // Dashed centre line (border-l-2 border-dashed border-muted-foreground/50).
  for (let yy = top; yy < top + h; yy += 10 * u) r.rect(x + w / 2 - 1 * u, yy, 2 * u, 6 * u, DASH);
  // Side avatars (h-10 w-10, emoji text-4xl) just past each end.
  const av = 40 * u, emo = 36 * u;
  if (facts.emojiA) r.image(facts.emojiA, x - 4 * u + (av - emo) / 2, cy - emo / 2, emo, emo);
  if (facts.emojiB) r.image(facts.emojiB, x + w + 4 * u - av + (av - emo) / 2, cy - emo / 2, emo, emo);
  // Flag group (triangle 18x20 over a 4x40 pole), centred on the position after this pull.
  const fx = x + (w * facts.pos) / 100, gTop = cy - 30 * u;
  r.fill([[fx - 9 * u, gTop, fx + 9 * u, gTop + 10 * u, fx - 9 * u, gTop + 20 * u]], FLAG);
  r.roundRect(fx - 2 * u, gTop + 20 * u, 4 * u, 40 * u, 2 * u, FG);
}

const nb = (s: string) => (s.length <= 16 ? s.replace(/ /g, "\u00a0") : s);

export async function renderPullCard(input: CardInput, size: CardSize): Promise<Uint8Array> {
  const pull = input.pull!;
  const [W, H] = CARD_SIZES[size];
  const L = LAYOUT[size];
  const f = getFonts();
  const pulled = pull.side === 0 ? input.a : input.b, other = pull.side === 0 ? input.b : input.a;
  const name = pulled.name.trim(), otherName = other.name.trim();
  const [emojiA, emojiB] = await Promise.all([loadSide(input.a), loadSide(input.b)]);
  const noun = pull.count === 1 ? "pull" : "pulls";
  // A name the font cannot draw would show empty boxes: leave the credit off instead.
  const by = pull.by && drawable(f.semibold, pull.by) ? pull.by : null;
  const facts: Facts = {
    label: "PAYMENT CONFIRMED",
    headline: receiptHeadline(pull.count, name),
    credit: by ? receiptCredit(by) : null,
    fields: [
      { dt: "Amount paid", dd: `${usd(pull.count * 100)} USD`, mono: true },
      { dt: "Pulls", dd: String(pull.count), mono: true },
      { dt: "Side", dd: name, mono: false },
      { dt: "Matchup", dd: pull.title.trim(), mono: false },
    ],
    title: pull.title.trim(),
    sideLine: `${name} · ${pull.count} ${noun}`,
    sideEmoji: pull.side === 0 ? emojiA : emojiB,
    emojiA,
    emojiB,
    pos: ropePosition(input.a.cents, input.b.cents),
    summary: {
      // Non-breaking spaces keep "Ronaldo $25" and "Messi all-time $25" together when the line wraps.
      strong: `${name} now ${usd(pulled.cents)} `,
      rest: `in ${currentRound(input.period === "week" ? "weekly" : "daily")} vs ${otherName}\u00a0${usd(other.cents)} · ${nb(name)}\u00a0all-time\u00a0${usd(pull.allTimeCents)}`,
    },
  };

  const cardW = W - 2 * L.mx;
  const brandH = L.brandBelow ? L.brand * 1.9 : 0;
  // Largest scale (up to the size's cap) at which the receipt and wordmark fit the image.
  let u = L.uMax, lay = layout(f, facts, size, cardW, u);
  while (u > 0.6 && lay.height + brandH > H - 2 * L.my) {
    u -= 0.02;
    lay = layout(f, facts, size, cardW, u);
  }
  const r = new Raster(W, H, PAGE);
  const oy = (H - lay.height - brandH) / 2, ox = L.mx;
  r.roundRect(ox, oy, cardW, lay.height, 24 * u, PRIMARY);
  r.roundRect(ox + lay.bw, oy + lay.bw, cardW - 2 * lay.bw, lay.height - 2 * lay.bw, 24 * u - lay.bw, OUTER);
  for (const op of lay.ops) op(r, ox, oy);
  if (L.brandBelow) {
    const bw = adv(f.mono, "tugg.lol", L.brand);
    draw(r, f.mono, "tugg.lol", (W - bw) / 2, oy + lay.height + brandH * 0.72, L.brand, FG);
  }
  return encodePng(r);
}
