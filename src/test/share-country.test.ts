import { describe, expect, it } from "vitest";
import { z } from "zod";
import { countryFromHeaders, showTikTok } from "@/lib/share-country";
import { SHARE_CHANNELS } from "@/lib/share";

describe("sharing country rules", () => {
  it("hides TikTok for server-detected India even with a foreign time zone", () => {
    expect(showTikTok(countryFromHeaders(new Headers({ "cf-ipcountry": "IN" })), "America/New_York")).toBe(false);
  });
  it("shows TikTok outside India even with an Indian time zone", () => {
    expect(showTikTok(countryFromHeaders(new Headers({ "x-vercel-ip-country": "US" })), "Asia/Kolkata")).toBe(true);
  });
  it.each(["Asia/Kolkata", "Asia/Calcutta"])("hides TikTok using %s when country is unavailable", (zone) => {
    expect(showTikTok(null, zone)).toBe(false);
  });
  it("shows TikTok when country and time zone are unknown", () => {
    expect(showTikTok(countryFromHeaders(new Headers()))).toBe(true);
  });
  it("ignores hosting unknown-country markers", () => {
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "XX" }))).toBe(null);
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "T1" }))).toBe(null);
  });
  it("allows Instagram and TikTok in the private click validator", () => {
    const channels = z.enum(SHARE_CHANNELS);
    expect(channels.parse("instagram")).toBe("instagram");
    expect(channels.parse("tiktok")).toBe("tiktok");
    expect(channels.safeParse("unapproved").success).toBe(false);
  });
});