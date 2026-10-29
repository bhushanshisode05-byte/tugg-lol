import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { aiSlots, pairKey, recapSummary } from "@/lib/jobs.server";
import { shareText, shareUrl } from "@/lib/share";

describe("AI generator rules", () => {
  it("creates at most 3 per day", () => expect(aiSlots(0)).toBe(3));
  it("stops at 30 active AI matchups", () => {
    expect(aiSlots(28)).toBe(2);
    expect(aiSlots(30)).toBe(0);
  });
  it("treats a pair in either order as a duplicate", () => expect(pairKey("Pizza", "Burgers")).toBe(pairKey("burgers", "PIZZA")));
});

describe("recap", () => {
  it("says honestly when there was no activity", () => {
    const s = recapSummary({ day: "2026-10-28", total_cents: 0, pulls: 0, countries: [], rounds: [] });
    expect(s).toContain("no activity");
  });
  it("uses only the real totals", () => {
    const s = recapSummary({
      day: "2026-10-28", total_cents: 1000, pulls: 1, countries: [{ country: "IN", pulls: 1, cents: 1000 }],
      rounds: [{ title: "Pizza vs Burgers", slug: "pizza-vs-burgers", a: "Pizza", b: "Burgers", a_cents: 0, b_cents: 1000, pullers: 1, winner: "Burgers", note: null }],
    });
    expect(s).toContain("$10");
    expect(s).toContain("1 pull ");
  });
});

describe("sharing", () => {
  it("writes the live score and links to SITE_URL", () => {
    expect(shareText({ slug: "p", title: "Pizza vs Burgers", sides: [{ name: "Pizza" }, { name: "Burgers" }], a: 4200, b: 5800 }))
      .toBe("Pizza vs Burgers is live on Tugg: Pizza $42 vs Burgers $58. Pull your side.");
    expect(shareUrl("https://tugg.lol/", "pizza-vs-burgers")).toBe("https://tugg.lol/m/pizza-vs-burgers");
  });
});
