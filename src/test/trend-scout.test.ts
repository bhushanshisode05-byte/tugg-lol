import { beforeEach, describe, expect, it, vi } from "vitest";
import { runScout, trendSlots } from "@/lib/trends/scout.server";
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ enabled: true, key: "test-key", rows: [] as Row[], made: 0, reserve: 0, completed: false, paused: false, verdict: true, candidates: [] as unknown[], create: vi.fn(), scout: vi.fn() }));
vi.mock("@/lib/server-utils.server", () => ({ config: () => ({ trendScout: state.enabled, xaiKey: state.key, siteUrl: "https://tugg.lol" }), slugify: (s: string) => s.toLowerCase().replaceAll(" ", "-") }));
vi.mock("@/lib/owner-matchups.server", () => ({ createModeratedOwnerMatchup: async (...args: unknown[]) => { state.create(...args); if (!state.verdict) return new Response("reject", { status: 422 }); return Response.json({ created: true, slug: `new-${++state.made}`, title: "A vs B" }, { status: 201 }); } }));
vi.mock("@/lib/trends/xai.server", async (original) => {
  const actual = await original<typeof import("@/lib/trends/xai.server")>();
  return { ...actual, scoutTrends: async () => { state.scout(); return state.candidates; }, draftWinner: async (_: unknown, kind: string) => `${kind} body` };
});
function from(table: string) {
  let op = "select", values: Row = {}, head = false;
  const filters: Array<(r: Row) => boolean> = [];
  const run = async () => {
    if (table === "job_state") return { data: { paused: state.paused }, error: null, count: 0 };
    if (table === "matchups") return { data: { id: "matchup-id" }, error: null, count: 0 };
    if (table !== "post_drafts") return { data: [], error: null, count: 0 };
    const rows = state.rows.filter(r => filters.every(f => f(r)));
    if (op === "update") rows.forEach(r => Object.assign(r, values));
    return { data: head ? null : rows, error: null, count: rows.length };
  };
  const b = {
    select: (_?: string, opts?: { head?: boolean }) => { head = !!opts?.head; return b; },
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return b; },
    lte: (k: string, v: string) => { filters.push(r => String(r[k]) <= v); return b; },
    limit: () => b,
    update: (v: Row) => { op = "update"; values = v; return b; },
    upsert: () => b,
    single: run, maybeSingle: run,
    then: <T, U>(ok: (v: Awaited<ReturnType<typeof run>>) => T | PromiseLike<T>, fail?: (e: unknown) => U | PromiseLike<U>) => run().then(ok, fail),
  };
  return b;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from,
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_trend_scout") return { data: !state.completed, error: null };
    if (name === "reserve_trend_rope") return { data: ++state.reserve <= 3, error: null };
    if (name === "save_trend_drafts") {
      if (state.rows.filter(r => r["status"] === "pending").length > 8) return { data: false, error: null };
      for (const kind of ["reply", "quote_tweet"]) state.rows.push({ status: "pending", kind, source_url: args["p_source"], expires_at: "2099-01-01" });
      return { data: true, error: null };
    }
    return { data: true, error: null };
  },
} }));
const trend = (i: number) => ({ title: `A${i} vs B${i}`, a: `A${i}`, b: `B${i}`, category: "Food", sourceUrl: `https://x.com/food/status/${i}`, why: "Preference argument" });
beforeEach(() => { Object.assign(state, { enabled: true, key: "test-key", rows: [], made: 0, reserve: 0, completed: false, paused: false, verdict: true, candidates: Array.from({ length: 6 }, (_, i) => trend(i)) }); state.create.mockClear(); state.scout.mockClear(); });
describe("bounded trend run", () => {
  it("flag off performs no scouting or inserts", async () => { state.enabled = false; expect(await runScout()).toEqual({ skipped: "disabled or no key" }); expect(state.scout).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled(); });
  it("missing key performs no scouting", async () => { state.key = ""; await expect(runScout()).resolves.toEqual({ skipped: "disabled or no key" }); expect(state.create).not.toHaveBeenCalled(); });
  it("invalid model output cannot touch creation", async () => { state.candidates = [{ ...trend(1), a: "x".repeat(41) }]; expect(await runScout()).toEqual({ created: 0, drafts: 0 }); expect(state.create).not.toHaveBeenCalled(); });
  it("creates at most three ropes and two drafts per rope", async () => { expect(await runScout()).toEqual({ created: 3, drafts: 6 }); expect(state.create).toHaveBeenCalledTimes(3); expect(state.rows).toHaveLength(6); });
  it("ten pending drafts blocks all new ropes", async () => { state.rows = Array.from({ length: 10 }, () => ({ status: "pending", expires_at: "2099-01-01" })); expect(await runScout()).toEqual({ created: 0, drafts: 0 }); expect(state.create).not.toHaveBeenCalled(); });
  it("eight pending drafts allows exactly one new rope", async () => { state.rows = Array.from({ length: 8 }, () => ({ status: "pending", expires_at: "2099-01-01" })); expect(await runScout()).toEqual({ created: 1, drafts: 2 }); expect(state.rows.filter(r => r["status"] === "pending")).toHaveLength(10); });
  it("expired drafts are discarded before counting queue capacity", async () => { state.rows = [{ status: "pending", expires_at: "2000-01-01" }]; await runScout(); expect(state.rows[0]?.["status"]).toBe("discarded"); });
  it("binding moderation refusal never gets draft rows", async () => { state.verdict = false; expect(await runScout()).toEqual({ created: 0, drafts: 0 }); expect(state.rows).toEqual([]); expect(state.create).toHaveBeenCalledTimes(3); });
  it("a durable pause or completed lease prevents provider work", async () => { state.paused = true; expect(await runScout()).toEqual({ skipped: "paused" }); expect(state.scout).not.toHaveBeenCalled(); });
  it("a completed run never replays inference", async () => { state.completed = true; expect(await runScout()).toEqual({ skipped: "already running or completed" }); expect(state.scout).not.toHaveBeenCalled(); });
  it("odd free capacity cannot create half a draft pair", () => { expect(trendSlots(9)).toBe(0); expect(trendSlots(7)).toBe(1); expect(trendSlots(0)).toBe(3); });
});