import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { emojiCode, looksLikeEmoji, twemojiUrl } from "@/lib/twemoji";
import { emojiCode as rendererEmojiCode, renderCard } from "@/lib/og/render.server";
import { SideEmoji } from "@/components/tugg/SideEmoji";
import { SideAvatar } from "@/components/tugg/SideAvatar";

const CDN = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shared Twemoji mapping", () => {
  it("the card renderer uses the same code-point logic as the site", () => {
    expect(rendererEmojiCode).toBe(emojiCode);
  });
  it.each([
    ["🐐", "1f410"],
    ["❤️", "2764"], // variation selector dropped without ZWJ
    ["❤", "2764"],
    ["🇮🇳", "1f1ee-1f1f3"], // flag = two regional indicators
    ["👍🏽", "1f44d-1f3fd"], // skin-tone modifier kept
    ["👩‍💻", "1f469-200d-1f4bb"], // ZWJ sequence
    ["🏳️‍🌈", "1f3f3-fe0f-200d-1f308"], // ZWJ keeps FE0F, as Twemoji names it
    ["1️⃣", "31-20e3"], // keycap
    [" 🔥 ", "1f525"],
  ])("%s → %s", (emoji, code) => {
    expect(emojiCode(emoji)).toBe(code);
    expect(twemojiUrl(emoji, "svg")).toBe(`${CDN}/svg/${code}.svg`);
    expect(twemojiUrl(emoji, "png")).toBe(`${CDN}/72x72/${code}.png`);
  });
  it("empty input has no file", () => {
    expect(twemojiUrl("", "svg")).toBeNull();
    expect(twemojiUrl("   ", "png")).toBeNull();
  });
  it("plain text is not treated as emoji", () => {
    expect(looksLikeEmoji("AB")).toBe(false);
    expect(looksLikeEmoji("12")).toBe(false);
    expect(looksLikeEmoji("🐐")).toBe(true);
    expect(looksLikeEmoji("🇮🇳")).toBe(true);
    expect(looksLikeEmoji("1️⃣")).toBe(true);
  });
  it("share cards still fetch exactly the same Twemoji PNG as before", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await renderCard(
      { kind: "live", day: "2026-11-11", a: { name: "Messi", emoji: "🐐", color: "#e8ff3a", cents: 0 }, b: { name: "Ronaldo", emoji: "👑", color: "#ff2e88", cents: 0 } },
      "link",
    );
    const urls = fetch.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls).toContain(`${CDN}/72x72/1f410.png`);
    expect(urls).toContain(`${CDN}/72x72/1f451.png`);
  });
});

describe("SideEmoji on the website", () => {
  it("draws the Twemoji SVG with the character as alt text and a fixed size", () => {
    render(<SideEmoji emoji="🐐" />);
    const img = screen.getByAltText("🐐") as HTMLImageElement;
    expect(img.src).toBe(`${CDN}/svg/1f410.svg`);
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
  it("shows text that has no Twemoji file as plain characters without a request", () => {
    render(<SideEmoji emoji="AB" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("AB")).toBeTruthy();
  });
  it("side avatars use the shared Twemoji image", () => {
    render(<SideAvatar side={{ name: "Messi", emoji: "🐐" }} size="lg" />);
    expect((screen.getByAltText("🐐") as HTMLImageElement).src).toBe(`${CDN}/svg/1f410.svg`);
  });
});
