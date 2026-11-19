// @vitest-environment node
// Recaps are a public, citable record: only live-money pulls count, whatever mode the site is in. A day whose only
// activity was test (sandbox) pulls is a quiet day and publishes nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as { name: string; args: any }[], writes: [] as { table: string; op: string; payload: any }[], pings: [] as string[][], closed: [] as any[] }));
// The site itself is in test mode: liveOnly() would include sandbox pulls everywhere else.
vi.mock("@/lib/server-utils.server", () => ({ config: () => ({ paymentsEnv: "sandbox", aiGenerator: false }), liveOnly: () => false, moderate: vi.fn(), slugify: (s: string) => s }));
vi.mock("@/lib/indexnow.server", () => ({ pingIndexNow: vi.fn(async (paths: string[]) => { state.pings.push(paths); return { status: 200 }; }) }));
vi.mock("@/integrations/supabase/client.server", () => {
  // One $25 sandbox pull on the day, and a closed round whose only money was that test pull.
  const SANDBOX = { facts: { total_cents: 2500, pulls: 1, countries: [{ country: "IN", pulls: 1, cents: 2500 }] }, matchups: [{ matchup_id: "m1", a_cents: 2500, b_cents: 0, pulls: 1 }], totals: [{ round_id: "r1", total_a_cents: 2500, total_b_cents: 0, pullers: 1 }] };
  const LIVE = { facts: { total_cents: 0, pulls: 0, countries: [] }, matchups: [], totals: [{ round_id: "r1", total_a_cents: 0, total_b_cents: 0, pullers: 0 }] };
  const rpc = async (name: string, args: any) => {
    state.calls.push({ name, args });
    const src = args?.p_live ? LIVE : SANDBOX;
    if (name === "tugg_day_facts") return { data: src.facts, error: null };
    if (name === "tugg_day_matchups") return { data: src.matchups, error: null };
    if (name === "tugg_round_totals") return { data: src.totals, error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    const c = { head: false };
    const resolve = () => table === "rounds" && c.head ? { count: 0, data: null, error: null }
      : table === "rounds" ? { data: state.closed, error: null }
      : table === "matchups" ? { data: [{ id: "m1", slug: "notion-vs-obsidian", title: "Notion vs Obsidian", sides: [{ position: 0, name: "Notion" }, { position: 1, name: "Obsidian" }] }], error: null }
      : { data: null, error: null };
    const b: any = {
      select: (_s: string, o?: { head?: boolean }) => { c.head = !!o?.head; return b; },
      insert: (p: any) => { state.writes.push({ table, op: "insert", payload: p }); return b; },
      upsert: (p: any) => { state.writes.push({ table, op: "upsert", payload: p }); return b; },
      update: (p: any) => { state.writes.push({ table, op: "update", payload: p }); return b; },
      delete: () => b, eq: () => b, lt: () => b, gte: () => b, in: () => b, is: () => b,
      maybeSingle: async () => resolve(), single: async () => resolve(),
      then: (res: any, rej: any) => Promise.resolve(resolve()).then(res, rej),
    };
    return b;
  };
  return { supabaseAdmin: { from, rpc } };
});

import { collectFacts, runRecap } from "@/lib/jobs.server";

beforeEach(() => {
  state.calls = []; state.writes = []; state.pings = [];
  state.closed = [{ id: "r1", winner_side_id: "s1", result_note: null, round_length: "weekly", matchups: { slug: "notion-vs-obsidian", title: "Notion vs Obsidian", status: "active", sides: [{ id: "s1", position: 0, name: "Notion" }, { id: "s2", position: 1, name: "Obsidian" }] } }];
});

describe("recaps count live-money pulls only", () => {
  it("a day whose only activity was a sandbox pull writes no recap and pings nothing, even in test mode", async () => {
    const out: any = await runRecap({ day: "2026-11-18" });
    expect(out.skipped).toBe("no activity");
    expect(state.writes.some((w) => w.table === "recaps")).toBe(false);
    expect(state.pings).toEqual([]);
    expect(state.writes).toContainEqual(expect.objectContaining({ table: "job_runs", op: "upsert", payload: expect.objectContaining({ status: "skipped", detail: expect.objectContaining({ reason: "no_activity", live_only: true, pulls: 0 }) }) }));
  });
  it("every recap figure is asked for live pulls only", async () => {
    const facts = await collectFacts("2026-11-18");
    const figures = state.calls.filter((c) => ["tugg_day_facts", "tugg_day_matchups", "tugg_round_totals"].includes(c.name));
    expect(figures.map((c) => c.name).sort()).toEqual(["tugg_day_facts", "tugg_day_matchups", "tugg_round_totals"]);
    expect(figures.every((c) => c.args.p_live === true)).toBe(true);
    expect(facts.pulls).toBe(0);
    // The round's stored winner came from a test pull, so the recap credits nobody.
    expect(facts.rounds[0]).toMatchObject({ a_cents: 0, b_cents: 0, winner: null });
  });
});
