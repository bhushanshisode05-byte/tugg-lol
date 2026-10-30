import { describe, it, expect } from "vitest";
import { shareLinks, SHARE_CHANNELS, shareText, shareUrl } from "@/lib/share";
import { shareEventSchema } from "@/lib/phone-share";

describe("simplified sharing", () => {
  it("allows only the requested counters", () => {
    expect(SHARE_CHANNELS).toEqual(["native", "copy", "x", "whatsapp", "facebook", "linkedin", "image_save", "share_error"]);
    for (const channel of ["instagram", "tiktok", "reddit", "telegram", "image_share"]) {
      expect(shareEventSchema.safeParse({ slug: "pizza-vs-burgers", channel }).success).toBe(false);
    }
  });
  it("provides only the four desktop social links", () => {
    expect(shareLinks("text", "https://tugg.lol/m/pizza-vs-burgers").map((link) => link.channel)).toEqual(["x", "whatsapp", "facebook", "linkedin"]);
  });
  it("copies real totals and the matchup URL", () => {
    const m = { slug: "pizza-vs-burgers", title: "Pizza vs Burgers", sides: [{ name: "Pizza" }, { name: "Burgers" }], a: 4200, b: 5800 };
    expect(`${shareText(m)} ${shareUrl("https://tugg.lol/", m.slug)}`).toBe("Pizza vs Burgers is live on Tugg: Pizza $42 vs Burgers $58. Pull your side. https://tugg.lol/m/pizza-vs-burgers");
  });
});
