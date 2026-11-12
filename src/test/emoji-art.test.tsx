import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { emojiArtUrl, emojiCode, looksLikeEmoji } from "@/lib/emoji-art";
import { emojiCode as rendererEmojiCode, renderCard } from "@/lib/og/render.server";
import { SideEmoji } from "@/components/tugg/SideEmoji";
import { SideAvatar } from "@/components/tugg/SideAvatar";

const NOTO = "https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.051";
const FLAGS_PNG = "https://cdn.jsdelivr.net/npm/emoji-datasource-google@16.0.0/img/google/64";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shared Noto Color Emoji mapping", () => {
  it("the card renderer uses the same code-point logic as the site", () => {
    expect(rendererEmojiCode).toBe(emojiCode);
  });
  it.each([
    ["🐐", "1f410"],
    ["❤️", "2764"], // variation selector dropped
    ["❤", "2764"],
    ["👍🏽", "1f44d_1f3fd"], // skin-tone modifier kept
    ["👩‍💻", "1f469_200d_1f4bb"], // ZWJ sequence
    ["🏳️‍🌈", "1f3f3_200d_1f308"], // Noto drops FE0F even inside ZWJ sequences
    ["🏳‍🌈", "1f3f3_200d_1f308"], // a pasted sequence missing FE0F still finds the same file
    ["1️⃣", "0031_20e3"], // keycap, padded to four digits
    ["©️", "00a9"],
    [" 🔥 ", "1f525"],
  ])("%s → %s", (emoji, code) => {
    expect(emojiCode(emoji)).toBe(code);
    expect(emojiArtUrl(emoji, "svg")).toBe(`${NOTO}/svg/emoji_u${code}.svg`);
    expect(emojiArtUrl(emoji, "png")).toBe(`${NOTO}/png/128/emoji_u${code}.png`);
  });
  it.each([
    ["🇮🇳", "1f1ee_1f1f3"],
    ["🏴󠁧󠁢󠁥󠁮󠁧󠁿", "1f3f4_e0067_e0062_e0065_e006e_e0067_e007f"], // England tag sequence
  ])("flag %s uses Noto's waved flag on the site and the same flag as PNG on cards", (emoji, code) => {
    expect(emojiArtUrl(emoji, "svg")).toBe(`${NOTO}/third_party/region-flags/waved-svg/emoji_u${code}.svg`);
    expect(emojiArtUrl(emoji, "png")).toBe(`${FLAGS_PNG}/${code.replace(/_/g, "-")}.png`);
  });
  it("territories that fly another flag use Noto's alias, on site and card alike", () => {
    expect(emojiCode("🇧🇻")).toBe("1f1f3_1f1f4"); // Bouvet Island → Norway
    expect(emojiArtUrl("🇺🇲", "png")).toBe(`${FLAGS_PNG}/1f1fa-1f1f8.png`);
  });
  it("flags Noto draws as a blank 'unknown flag' have no artwork, so they stay plain characters", () => {
    for (const e of ["🇧🇱", "🇧🇶", "🇲🇶", "🇷🇪", "🇹🇫"]) {
      expect(emojiArtUrl(e, "svg")).toBeNull();
      expect(emojiArtUrl(e, "png")).toBeNull();
    }
  });
  it("empty input has no file", () => {
    expect(emojiArtUrl("", "svg")).toBeNull();
    expect(emojiArtUrl("   ", "png")).toBeNull();
  });
  it("plain text is not treated as emoji", () => {
    expect(looksLikeEmoji("AB")).toBe(false);
    expect(looksLikeEmoji("12")).toBe(false);
    expect(looksLikeEmoji("🐐")).toBe(true);
    expect(looksLikeEmoji("🇮🇳")).toBe(true);
    expect(looksLikeEmoji("1️⃣")).toBe(true);
  });
  it("share cards fetch the Noto PNG of the same code the site shows", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await renderCard(
      { kind: "live", day: "2026-11-11", a: { name: "Messi", emoji: "🐐", color: "#e8ff3a", cents: 0 }, b: { name: "India", emoji: "🇮🇳", color: "#ff2e88", cents: 0 } },
      "link",
    );
    const urls = fetch.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls).toContain(`${NOTO}/png/128/emoji_u1f410.png`);
    expect(urls).toContain(`${FLAGS_PNG}/1f1ee-1f1f3.png`);
    expect(urls.some((u) => u.includes("twemoji"))).toBe(false);
  });
});

describe("SideEmoji on the website", () => {
  it("draws the Noto SVG with the character as alt text and a fixed size", () => {
    render(<SideEmoji emoji="🐐" />);
    const img = screen.getByAltText("🐐") as HTMLImageElement;
    expect(img.src).toBe(`${NOTO}/svg/emoji_u1f410.svg`);
    expect(img.getAttribute("width")).toBe("72");
    expect(img.getAttribute("height")).toBe("72");
    expect(img.className).toContain("h-[1.1em]");
    expect(img.getAttribute("loading")).toBe("lazy");
  });
  it("falls back to the plain character when the image fails", () => {
    render(<SideEmoji emoji="👍🏽" />);
    fireEvent.error(screen.getByAltText("👍🏽"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("👍🏽")).toBeTruthy();
  });
  it("falls back when the image already failed before hydration", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    render(<SideEmoji emoji="🐐" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("🐐")).toBeTruthy();
    complete.mockRestore();
  });
  it("shows text that has no Noto file as plain characters without a request", () => {
    render(<SideEmoji emoji="AB" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("AB")).toBeTruthy();
    render(<SideEmoji emoji="🇷🇪" />);
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("side avatars use the shared Noto image", () => {
    render(<SideAvatar side={{ name: "Messi", emoji: "🐐" }} size="lg" />);
    expect((screen.getByAltText("🐐") as HTMLImageElement).src).toBe(`${NOTO}/svg/emoji_u1f410.svg`);
  });
});
