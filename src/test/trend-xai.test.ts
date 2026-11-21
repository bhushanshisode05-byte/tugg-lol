import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { scoutTrends, draftWinner } from "@/lib/trends/xai.server";
import { validVoice } from "@/lib/trends/voice";
const state = vi.hoisted(() => ({ enabled: false, key: "" }));
vi.mock("@/lib/server-utils.server", () => ({ config: () => ({ trendScout: state.enabled, xaiKey: state.key }) }));
const trend = { title: "Pizza vs Burgers", a: "Pizza", b: "Burgers", category: "Food", sourceUrl: "https://x.com/food/status/123", why: "A live preference argument" };
const response = (value: unknown) => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] }));
beforeEach(() => { state.enabled = false; state.key = ""; vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => vi.unstubAllGlobals());
describe("read-only scout adapter", () => {
  it("flag off does not call any provider", async () => { state.key = "key"; expect(await scoutTrends()).toEqual([]); expect(fetch).not.toHaveBeenCalled(); });
  it("missing own-account key is a quiet no-op", async () => { state.enabled = true; expect(await scoutTrends()).toEqual([]); expect(fetch).not.toHaveBeenCalled(); });
  it("validates untrusted sides, categories and source URLs before returning", async () => {
    state.enabled = true; state.key = "key";
    vi.mocked(fetch).mockResolvedValue(response({ trends: [trend, { ...trend, a: "x".repeat(41) }, { ...trend, category: "Politics" }, { ...trend, sourceUrl: "https://evil.example/post" }] }));
    expect(await scoutTrends()).toEqual([trend]);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe("https://api.x.ai/v1/responses");
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.tools).toEqual([expect.objectContaining({ type: "x_search" })]);
    expect(call?.[1]?.signal).toBeDefined();
  });
  it("generates exactly five bodies and stores only the independently judged winner", async () => {
    state.enabled = true; state.key = "key";
    const candidates = Array.from({ length: 5 }, (_, i) => `Pizza wins dinner ${i}. Burgers can wait.`);
    vi.mocked(fetch).mockResolvedValueOnce(response({ candidates })).mockResolvedValueOnce(response({ winner: 3, compliant: true }));
    expect(await draftWinner(trend as Parameters<typeof draftWinner>[0], "reply", "https://tugg.lol/m/pizza-vs-burgers")).toBe(candidates[3]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("a response body or key never escapes into provider errors", async () => {
    state.enabled = true; state.key = "secret-key";
    vi.mocked(fetch).mockResolvedValue(new Response("raw recipient@example.com secret-key", { status: 403 }));
    await expect(scoutTrends()).rejects.toThrow("Trend provider unavailable (403)");
  });
  it("banned phrases, opener asks and reply links are refused", () => {
    for (const text of ["The internet is divided.", "Pick a side.", "Who wins?", "Pizza wins https://tugg.lol", "Not just pizza but dinner."]) expect(validVoice(text, "reply", "link")).toBe(false);
  });
  it("no trend file can call a social posting endpoint or carry posting credentials", () => {
    for (const file of readdirSync("src/lib/trends").filter(f => /\.(ts|tsx)$/.test(f))) {
      const text = readFileSync(`src/lib/trends/${file}`, "utf8");
      expect(text).not.toMatch(/https?:\/\/(?:api\.)?(?:twitter\.com|x\.com)\/.*(?:tweets|statuses\/update|posts)|X_(?:API_KEY|ACCESS_TOKEN)|TWITTER_(?:API|ACCESS)|oauth\/access_token/);
      // All actual fetch targets are the xAI read/model API or the private review endpoint.
      for (const target of text.matchAll(/fetch\("([^"]+)"/g)) expect(["https://api.x.ai/v1/responses", "/api/public/admin/drafts"]).toContain(target[1]);
    }
  });
});