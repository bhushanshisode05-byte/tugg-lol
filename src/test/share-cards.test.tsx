import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";

const data = vi.hoisted(() => ({ matchup: null as any, result: null as any, pull: null as any }));
vi.mock("@/lib/tugg.functions", () => ({
  getMatchup: vi.fn(async () => (data.matchup ? { matchup: data.matchup } : null)),
  getResult: vi.fn(async () => data.result),
  loadPullCard: vi.fn(async () => data.pull),
}));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: ({ m }: any) => <button data-share={JSON.stringify(m)}>Share</button> }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));

import { Route as MatchupImage } from "@/routes/api/public/og/m.$slug";
import { Route as ResultImage } from "@/routes/api/public/og/r.$id";
import { Route as PullImage } from "@/routes/api/public/og/p.$id";
import {
  CARD_SIZES, type CardInput, type CardSize, IMMUTABLE_CACHE, SHORT_CACHE, cardDisplayName, cardVersion, matchupCardInput, matchupImagePath,
  PULL_CARD_DESIGN, pullHeadline, pullImagePath, receiptHeadline, resultCardInput, resultImagePath, versionedCache,
} from "@/lib/og/card";
import { SITE_COLORS, SITE_TOKENS, oklchToHex } from "@/lib/og/theme";
import { decodePng } from "@/lib/og/raster";
import { METRICS, renderCard } from "@/lib/og/render.server";
import { shareImagePath, shareText } from "@/lib/share";
import { PaymentReceipt } from "@/components/tugg/PaymentReceipt";

const get = (route: any) => (route.options ?? route).server.handlers.GET;
const out = process.env["SHARE_IMAGE_OUT"];
const messi = { id: "a1111111-1111-4111-8111-111111111111", position: 0, name: "Messi", emoji: "🐐", color: "#60a5fa", image_id: null, image_status: null };
const ronaldo = { id: "b2222222-2222-4222-8222-222222222222", position: 1, name: "Ronaldo", emoji: "⚽", color: "#ef4444", image_id: null, image_status: null };
const round = (a: number, b: number) => ({ id: "r1", starts_at: "2026-11-11T00:00:00+00:00", total_a_cents: a, total_b_cents: b });
const matchup = (a: number, b: number) => ({ slug: "messi-vs-ronaldo", title: "Messi vs Ronaldo", sides: [messi, ronaldo], round: round(a, b) });
const PULL_ID = "c3333333-3333-4333-8333-333333333333";
const pullCard = (over: Record<string, unknown> = {}) => ({ id: PULL_ID, slug: "messi-vs-ronaldo", title: "Messi vs Ronaldo", sides: [messi, ronaldo], sideId: ronaldo.id, pulls: 25, by: null, day: "2026-11-11", totalA: 0, totalB: 2500, sideAllTime: 2500, ...over });

async function fetchImage(route: any, path: string, params: Record<string, string>) {
  const res: Response = await get(route)({ request: new Request(`https://tugg.lol${path}`), params });
  return { res, bytes: new Uint8Array(await res.arrayBuffer()) };
}
const same = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);

beforeEach(() => { data.matchup = null; data.result = null; data.pull = null; });
afterEach(() => cleanup());

describe("score-versioned live matchup card", () => {
  it("token is the round totals plus a fingerprint, and changes when the score changes", () => {
    const before = cardVersion(matchupCardInput(matchup(0, 0))!);
    const after = cardVersion(matchupCardInput(matchup(0, 2500))!);
    expect(before).toMatch(/^0-0-[0-9a-z]+$/);
    expect(after).toMatch(/^0-2500-[0-9a-z]+$/);
    expect(matchupImagePath("messi-vs-ronaldo", "story", after)).toBe(`/api/public/og/m/messi-vs-ronaldo?size=story&v=${after}`);
  });
  it("a new round at the same score still gets a new token (day is part of the fingerprint)", () => {
    const next = { ...matchup(0, 0), round: { ...round(0, 0), starts_at: "2026-11-12T00:00:00+00:00" } };
    expect(cardVersion(matchupCardInput(next)!)).not.toBe(cardVersion(matchupCardInput(matchup(0, 0))!));
  });

  it("stale case: render, change the score, render again — URL and image both change", async () => {
    data.matchup = matchup(0, 0);
    const v1 = cardVersion(matchupCardInput(data.matchup)!);
    const url1 = matchupImagePath("messi-vs-ronaldo", "link", v1);
    const first = await fetchImage(MatchupImage, url1, { slug: "messi-vs-ronaldo" });
    expect(first.res.headers.get("Cache-Control")).toBe(IMMUTABLE_CACHE);

    data.matchup = matchup(0, 2500); // the $25 pull lands
    const v2 = cardVersion(matchupCardInput(data.matchup)!);
    const url2 = matchupImagePath("messi-vs-ronaldo", "link", v2);
    const second = await fetchImage(MatchupImage, url2, { slug: "messi-vs-ronaldo" });
    if (out) { writeFileSync(`${out}/stale-before.png`, first.bytes); writeFileSync(`${out}/stale-after.png`, second.bytes); }
    expect(url2).not.toBe(url1);
    expect(same(first.bytes, second.bytes)).toBe(false);
    expect(second.res.headers.get("Cache-Control")).toBe(IMMUTABLE_CACHE);
  }, 30000);

  it("the token is only a cache key: an old or missing token still draws current data, briefly cached", async () => {
    data.matchup = matchup(0, 2500);
    const current = await fetchImage(MatchupImage, matchupImagePath("messi-vs-ronaldo", "link", cardVersion(matchupCardInput(data.matchup)!)), { slug: "messi-vs-ronaldo" });
    const stale = await fetchImage(MatchupImage, matchupImagePath("messi-vs-ronaldo", "link", "0-0-old"), { slug: "messi-vs-ronaldo" });
    const none = await fetchImage(MatchupImage, matchupImagePath("messi-vs-ronaldo", "link"), { slug: "messi-vs-ronaldo" });
    expect(same(current.bytes, stale.bytes)).toBe(true);
    expect(same(current.bytes, none.bytes)).toBe(true);
    expect(stale.res.headers.get("Cache-Control")).toBe(SHORT_CACHE);
    expect(none.res.headers.get("Cache-Control")).toBe(SHORT_CACHE);
  }, 30000);

  it("phone share and desktop save on the matchup page fetch the versioned live card", () => {
    const v = cardVersion(matchupCardInput(matchup(0, 2500))!);
    expect(shareImagePath({ slug: "messi-vs-ronaldo", v }, "story")).toBe(`/api/public/og/m/messi-vs-ronaldo?size=story&v=${v}`);
  });
});

describe("result card versioning", () => {
  const result = { id: "d4444444-4444-4444-8444-444444444444", ends_at: "2026-11-11T00:00:00Z", pullers: 3, winner_cents: 2500, loser_cents: 500, winner: ronaldo, loser: messi };
  it("matching token is immutable, unversioned keeps the old one-hour cache", async () => {
    data.result = result;
    const v = cardVersion(resultCardInput(result));
    expect(v).toBe(`500-2500-${v.split("-")[2]}`);
    const hit = await fetchImage(ResultImage, resultImagePath(result.id, "link", v), { id: result.id });
    const plain = await fetchImage(ResultImage, resultImagePath(result.id, "link"), { id: result.id });
    expect(hit.res.headers.get("Cache-Control")).toBe(IMMUTABLE_CACHE);
    expect(plain.res.headers.get("Cache-Control")).toBe("public, max-age=3600, s-maxage=3600");
  }, 30000);
});

describe("cache rules", () => {
  it("hard cache only for an exact token", () => {
    const input = matchupCardInput(matchup(0, 2500))!;
    expect(versionedCache(input, cardVersion(input))).toBe(IMMUTABLE_CACHE);
    expect(versionedCache(input, "0-0-x")).toBe(SHORT_CACHE);
    expect(versionedCache(input, null)).toBe(SHORT_CACHE);
  });
});

describe("personal pull card", () => {
  it("the card's headline is the receipt's own second-person wording", () => {
    expect(receiptHeadline(25, "Messi")).toBe("You pulled 25 for Messi!");
    const line = { matchupId: "m1", slug: "messi-vs-ronaldo", title: "Messi vs Ronaldo", sides: [messi, ronaldo] as any, sideId: messi.id, pulls: 25, totalA: 2500, totalB: 2500, pull: null };
    const { container } = render(<PaymentReceipt receipt={{ amountCents: 2500, pulls: 25, refundedPulls: 0, siteUrl: "https://tugg.lol", lines: [line] } as any} />);
    expect(container.querySelector("#receipt-title")!.textContent).toBe(receiptHeadline(25, "Messi"));
  });
  it("share text stays first person, or credits a display name", () => {
    expect(pullHeadline(null, 25, "Ronaldo")).toBe("I pulled 25 for Ronaldo");
    expect(pullHeadline("Harry", 25, "Ronaldo")).toBe("Harry pulled 25 for Ronaldo");
  });
  it("pull card links carry the design number so a redesign never serves the old cached image", () => {
    expect(PULL_CARD_DESIGN).toBe(3);
    expect(pullImagePath(PULL_ID, "story")).toBe(`/api/public/og/p/${PULL_ID}?size=story&d=3`);
  });
  it("names that look private or are blank fall back to the first-person form", () => {
    expect(cardDisplayName("Harry")).toBe("Harry");
    expect(cardDisplayName("  Harry   K ")).toBe("Harry K");
    for (const bad of ["", "   ", null, "harry@example.com", "visit https://x.y", "www.spam.lol", "tugg.lol", "pay_0NrU052oOMEb89", "Order 12345678", "Anonymous", "a".repeat(41)])
      expect(cardDisplayName(bad as string | null)).toBeNull();
  });

  for (const size of ["link", "square", "story"] as const)
    it(`serves a ${size} PNG at the exact size, cached permanently`, async () => {
      data.pull = pullCard();
      const { res, bytes } = await fetchImage(PullImage, pullImagePath(PULL_ID, size), { id: PULL_ID });
      if (out) writeFileSync(`${out}/pull-${size}.png`, bytes);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe(IMMUTABLE_CACHE);
      const img = await decodePng(bytes);
      expect([img?.w, img?.h]).toEqual({ link: [1200, 630], square: [1080, 1080], story: [1080, 1920] }[size]);
    }, 30000);

  it("a display name adds a credit line; an undrawable name is left off", async () => {
    const base = pullCard();
    const input = (by: string | null) => ({ kind: "pull" as const, day: base.day, a: { ...messi, cents: 0 }, b: { ...ronaldo, cents: 2500 }, pull: { side: 1 as const, count: 25, by, title: base.title, allTimeCents: 2500 } });
    const [me, harry, boxes] = await Promise.all([renderCard(input(null), "link"), renderCard(input("Harry"), "link"), renderCard(input("ハリー"), "link")]);
    if (out) { writeFileSync(`${out}/pull-harry-link.png`, harry); }
    expect(same(me, harry)).toBe(false);
    expect(same(me, boxes)).toBe(true);
  }, 30000);

  it("the card is a snapshot: a later score change cannot alter it", async () => {
    data.pull = pullCard();
    const first = await fetchImage(PullImage, pullImagePath(PULL_ID), { id: PULL_ID });
    data.matchup = matchup(9000, 2500); // the live score moves on; the pull card does not read it
    const again = await fetchImage(PullImage, pullImagePath(PULL_ID), { id: PULL_ID });
    expect(same(first.bytes, again.bytes)).toBe(true);
  }, 30000);

  it("unknown or malformed pull ids are 404", async () => {
    expect((await fetchImage(PullImage, pullImagePath(PULL_ID), { id: PULL_ID })).res.status).toBe(404);
    expect((await fetchImage(PullImage, "/api/public/og/p/x", { id: "not-a-uuid" })).res.status).toBe(404);
  });

  it("share text is first person and uses the snapshot totals", () => {
    expect(shareText({ slug: "messi-vs-ronaldo", title: "Messi vs Ronaldo", sides: [messi, ronaldo], a: 0, b: 2500, pull: { id: PULL_ID, count: 25, sideName: "Ronaldo" } }))
      .toBe("I pulled 25 for Ronaldo on Tugg: Messi $0 vs Ronaldo $25. Pull your side.");
  });
});

describe("receipt wiring", () => {
  const receipt = (pull: any) => ({ amountCents: 2500, pulls: 25, refundedPulls: 0, siteUrl: "https://tugg.lol", lines: [{ matchupId: "m1", slug: "messi-vs-ronaldo", title: "Messi vs Ronaldo", sides: [messi, ronaldo] as any, sideId: ronaldo.id, pulls: 25, totalA: 900, totalB: 2500, pull }] });
  it("the receipt's Share button uses the personal pull card with snapshot totals", () => {
    const { container } = render(<PaymentReceipt receipt={receipt({ id: PULL_ID, totalA: 0, totalB: 2500 })} />);
    const m = JSON.parse(container.querySelector("[data-share]")!.getAttribute("data-share")!);
    expect(m.pull).toEqual({ id: PULL_ID, count: 25, sideName: "Ronaldo" });
    expect([m.a, m.b]).toEqual([0, 2500]);
    expect(shareImagePath(m, "story")).toBe(`/api/public/og/p/${PULL_ID}?size=story&d=3`);
  });
  it("without a recorded pull it falls back to the live matchup card", () => {
    const { container } = render(<PaymentReceipt receipt={receipt(null)} />);
    const m = JSON.parse(container.querySelector("[data-share]")!.getAttribute("data-share")!);
    expect(m.pull).toBeUndefined();
    expect(shareImagePath(m, "story")).toMatch(/^\/api\/public\/og\/m\/messi-vs-ronaldo\?size=story/);
  });
});

describe("every share card's colours are the site's real tokens", () => {
  it("token values are copied verbatim from :root in src/styles.css", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    for (const [name, value] of Object.entries(SITE_TOKENS)) expect(root).toContain(`--${name}: ${value};`);
  });
  it("converts them to the sRGB colours the browser shows", () => {
    expect(SITE_COLORS.background).toBe("#08090d");
    expect(SITE_COLORS.card).toBe("#121419");
    expect(SITE_COLORS.foreground).toBe("#f6f5ee");
    expect(SITE_COLORS.primary).toBe("#e1f32a");
    expect(SITE_COLORS["muted-foreground"]).toBe("#999eab");
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
  });
  it("the pull card's page background is the site background", async () => {
    data.pull = pullCard();
    const img = (await decodePng((await fetchImage(PullImage, pullImagePath(PULL_ID), { id: PULL_ID })).bytes))!;
    expect(Array.from(img.rgba.slice(0, 3))).toEqual([0x08, 0x09, 0x0d]);
  }, 30000);
  it("the renderers define no colours of their own; theme.ts is the only palette", () => {
    for (const f of ["src/lib/og/render.server.ts", "src/lib/og/pull-card.server.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain('from "./theme"');
      expect(src.match(/#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/gi)).toBeNull();
    }
  });

  // Sample known pixels of the live and result cards: background (under each side's 13% wash), the rope between
  // two hatch marks, and the flag cloth. Equal totals put the flag at the centre, clear of the sampled rope.
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const wash = (side: string) => rgb(SITE_COLORS.background).map((v, i) => v + (rgb(side)[i]! - v) * 0.13);
  const near = (got: number[], want: number[]) => got.forEach((v, i) => expect(Math.abs(v - want[i]!)).toBeLessThanOrEqual(2));
  const sides = { a: { ...messi, emoji: null, cents: 1000 }, b: { ...ronaldo, emoji: null, cents: 1000 } } as const;
  const cards: Record<"live" | "result", CardInput> = {
    live: { kind: "live", title: "Messi vs Ronaldo", day: "2026-11-16", period: "week", ...sides } as CardInput,
    result: { kind: "result", title: "Messi vs Ronaldo", day: "2026-11-16", period: "week", winner: 0, pullers: 3, ...sides } as CardInput,
  };
  for (const kind of ["live", "result"] as const)
    for (const size of Object.keys(CARD_SIZES) as CardSize[])
      it(`the ${kind} card at ${size} size draws background, rope and flag in the site tokens`, async () => {
        const img = (await decodePng(await renderCard(cards[kind], size)))!;
        const [W, H] = CARD_SIZES[size];
        const m = METRICS[size], t = m.rope;
        const px = (x: number, y: number) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return Array.from(img.rgba.slice(i, i + 3)); };
        near(px(2, H - 3), wash(messi.color));
        near(px(W - 3, H - 3), wash(ronaldo.color));
        near(px(m.pad + t + t * 1.5, m.ropeY), rgb(SITE_COLORS.rope));
        near(px(m.pad + t + t * 1.7, m.ropeY), rgb(SITE_COLORS.rope));
        near(px(W / 2 + t * 0.5, m.ropeY - t * 2.2 + t * 0.55), rgb(SITE_COLORS.accent));
      }, 30000);
});

describe("no private field can reach an image", () => {
  const sql = readFileSync("drizzle/migrations/0019_pull_card_snapshots.sql", "utf8");
  const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.tugg_pull_card"));
  it("the public pull read returns only public columns", () => {
    const returns = fn.slice(fn.indexOf("RETURNS TABLE("), fn.indexOf(")\nLANGUAGE"));
    expect(returns).toBe("RETURNS TABLE(id uuid, matchup_id uuid, side_id uuid, amount_cents int, display_name text, round_starts_at timestamptz, total_a_cents bigint, total_b_cents bigint");
    for (const secret of ["stripe_session_id", "buyer_email", "payment_id", "checkout_id", "dodo_orders", "country", "environment,"]) expect(returns).not.toContain(secret);
    expect(fn).not.toMatch(/dodo_orders|payglocal_orders|buyer_email|stripe_session_id/);
  });
  it("the public all-time read returns one number and touches no private table or column", () => {
    const prior = readFileSync("drizzle/migrations/0020_pull_card_side_prior_total.sql", "utf8");
    expect(prior).toMatch(/RETURNS bigint/);
    expect(prior).not.toMatch(/dodo_orders|payglocal_orders|buyer_email|stripe_session_id|country|shout_out/);
  });
  it("image routes and the card loader never mention private fields", () => {
    const files = ["src/routes/api/public/og/p.$id.ts", "src/routes/api/public/og/m.$slug.ts", "src/routes/api/public/og/r.$id.ts", "src/lib/og/card.ts", "src/lib/og/render.server.ts", "src/lib/og/pull-card.server.ts", "src/lib/og/theme.ts"];
    const loader = readFileSync("src/lib/tugg.functions.ts", "utf8").split("export async function loadPullCard")[1]!;
    for (const text of [...files.map((f) => readFileSync(f, "utf8")), loader])
      expect(text).not.toMatch(/buyer_email|stripe_session_id|payment_id|checkout_id|dodo_orders|payglocal_orders|customer/i);
  });
  it("the receipt never returns the pull session key to the browser", () => {
    const src = readFileSync("src/lib/payments/receipt.server.ts", "utf8");
    expect(src).toMatch(/\{ id: p\.id, totalA: Number\(p\.round_a_after_cents\), totalB: Number\(p\.round_b_after_cents\) \}/);
  });
});
