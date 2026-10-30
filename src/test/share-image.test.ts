import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { renderCard, fit, readable, emojiCode } from "@/lib/og/render.server";
import { decodePng } from "@/lib/og/raster";
import { CARD_SIZES, type CardInput, type CardSize } from "@/lib/og/card";
import { ropePosition } from "@/components/tugg/Rope";

const out = process.env["SHARE_IMAGE_OUT"];
const base: CardInput = {
  kind: "live",
  day: "2026-10-30",
  a: { name: "Pizza", emoji: "🍕", color: "#ef4444", cents: 0 },
  b: { name: "Burgers", emoji: "🍔", color: "#f59e0b", cents: 0 },
};
const cases: Record<string, CardInput> = {
  zero: base,
  uneven: { ...base, a: { ...base.a, cents: 4200 }, b: { ...base.b, cents: 15800 } },
  long: {
    ...base,
    a: { name: "The Extraordinarily Long Side Name Of Champions United", emoji: "🏆", color: "#111111", cents: 123456700 },
    b: { name: "Supercalifragilisticexpialidocious Mega Burgers Deluxe", emoji: "🍔", color: "#22c55e", cents: 99900 },
  },
  result: { ...base, kind: "result", a: { ...base.a, cents: 1000 }, b: { ...base.b, cents: 2000 }, winner: 1, pullers: 3 },
};

describe("share images", () => {
  for (const [name, input] of Object.entries(cases))
    for (const size of Object.keys(CARD_SIZES) as CardSize[])
      it(`${name} renders a ${size} PNG at the exact size`, async () => {
        const png = await renderCard(input, size);
        if (out) writeFileSync(`${out}/${name}-${size}.png`, png);
        const img = await decodePng(png);
        expect([img?.w, img?.h]).toEqual([...CARD_SIZES[size]]);
      }, 30000);

  it("sizes are story 1080x1920, square 1080x1080, link 1200x630", () => {
    expect(CARD_SIZES).toEqual({ story: [1080, 1920], square: [1080, 1080], link: [1200, 630] });
  });
  it("flag sits in the centre at $0 and moves toward the leading side", () => {
    expect(ropePosition(0, 0)).toBe(50);
    expect(ropePosition(4200, 15800)).toBeGreaterThan(50);
  });
  it("very long names are shrunk then truncated to fit their column", async () => {
    const { default: opentype } = await import("opentype.js");
    void opentype;
    const r = fit(
      // a fake font with 10px per char at size 10 keeps this test about the fitting rule
      { getAdvanceWidth: (t: string, s: number) => t.length * s } as never,
      "x".repeat(200),
      300,
      40,
      20,
    );
    expect(r.size).toBe(20);
    expect(r.w).toBeLessThanOrEqual(300);
    expect(r.text.endsWith("…")).toBe(true);
  });
  it("dark side colours are lifted for readable names", () => {
    const [r, g, b] = readable("#000000");
    expect(r + g + b).toBeGreaterThan(300);
  });
  it("emoji file names follow Twemoji", () => {
    expect(emojiCode("🍕")).toBe("1f355");
    expect(emojiCode("❤️")).toBe("2764");
  });
});
