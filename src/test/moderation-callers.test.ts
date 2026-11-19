// @vitest-environment node
// Every moderate() caller treats "unavailable" as no verdict: the generator skips the candidate without logging a
// "rejected" row, and a shout-out that could not be checked is handed back to the buyer before any payment.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ writes: [] as { table: string; op: string; payload: any }[], verdicts: [] as any[], candidates: [] as any[] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator() { return this; }, handler(fn: any) { return (arg: any) => fn(arg); } }) }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://tugg.lol/m/x"), getRequestIP: () => "1.2.3.4" }));
vi.mock("@/lib/turnstile.server", () => ({ verifyTurnstileForRequest: vi.fn(async () => {}) }));
vi.mock("@/lib/payments/selection.server", () => ({ paymentReadiness: vi.fn(), selectedProvider: () => ({ environment: "sandbox", validateProduct: vi.fn(), checkout: vi.fn(async () => ({ sessionId: "cks", url: "https://test.checkout.dodopayments.com/x" })) }), selectedProduct: () => "pdt_5", basketActive: () => false }));
vi.mock("@/lib/server-utils.server", () => ({
  config: () => ({ pausePulls: false, paymentProvider: "dodo", pullMode: "immediate", paymentsEnv: "sandbox", aiGenerator: true }),
  liveOnly: () => false,
  slugify: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  SHOUT_OUT_UNAVAILABLE: "We couldn't check your name and shout-out just now. Try again in a minute, or clear them to pull without one. Nothing was charged.",
  moderate: vi.fn(async () => state.verdicts.shift()),
}));
vi.mock("ai", () => ({ Output: { object: (x: unknown) => x }, streamText: () => ({ output: Promise.resolve({ candidates: state.candidates }) }) }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => ({ responses: () => ({}) }) }));
vi.mock("@/lib/ai/run-id.ts", () => ({ createLovableAiGatewayRunIdFetch: () => ({ fetch }) }));
vi.mock("@/integrations/supabase/client.server", () => {
  const from = (table: string) => {
    const c = { head: false, op: "select" };
    const resolve = () => {
      if (c.head) return { count: 0, data: null, error: null };
      if (table === "matchups" && c.op === "insert") return { data: { id: "m-new" }, error: null };
      if (table === "sides" && c.op === "select") return { data: [], error: null };
      if (table === "sides" && c.op === "single") return { data: { id: "s1", matchups: { status: "active" } }, error: null };
      return { data: null, error: null };
    };
    const w = (op: string) => (p: any) => { c.op = op; state.writes.push({ table, op, payload: p }); return b; };
    const b: any = {
      select: (_s?: string, o?: { head?: boolean }) => { c.head = !!o?.head; return b; },
      insert: w("insert"), upsert: w("upsert"), update: w("update"), delete: () => b,
      eq: () => b, is: () => b, in: () => b, lt: () => b, order: () => b, limit: () => b,
      maybeSingle: async () => resolve(),
      single: async () => { if (c.op === "select") c.op = "single"; return resolve(); },
      then: (res: any, rej: any) => Promise.resolve(resolve()).then(res, rej),
    };
    return b;
  };
  return { supabaseAdmin: { from, rpc: async (name: string) => ({ data: name === "take_checkout_slot" ? true : [], error: null }) } };
});

import { runGenerator } from "@/lib/jobs.server";
import { buyImmediateBundle } from "@/lib/immediate-payments.functions";

const rows = (table: string, op = "insert") => state.writes.filter((w) => w.table === table && w.op === op).map((w) => w.payload);
beforeEach(() => { state.writes = []; state.verdicts = []; state.candidates = []; vi.stubEnv("LOVABLE_API_KEY", "test-key"); });

describe("AI generator", () => {
  it("skips a candidate whose moderation errored without logging it as rejected, and still creates the next one", async () => {
    state.candidates = [
      { category: "Food", a: "Tacos", a_emoji: "🌮", b: "Sushi", b_emoji: "🍣", description: "Dinner." },
      { category: "Food", a: "Tea", a_emoji: "🍵", b: "Coffee", b_emoji: "☕", description: "Morning." },
    ];
    state.verdicts = [{ outcome: "unavailable", reason: "Moderation error 503" }, { outcome: "allowed", reason: "Friendly" }];
    const out: any = await runGenerator({ force: true });
    expect(out.created).toEqual(["tea-vs-coffee"]);
    expect(out.moderationUnavailable).toBe(1);
    const log = rows("moderation_log");
    expect(log).toEqual([expect.objectContaining({ subject_type: "ai_matchup", subject_id: "tea-vs-coffee", verdict: "allowed" })]);
    expect(log.some((r) => r.verdict === "rejected" || /Tacos/.test(r.content))).toBe(false);
    expect(rows("job_runs", "update")).toContainEqual(expect.objectContaining({ status: "done", detail: expect.objectContaining({ moderation_unavailable: 1 }) }));
  });
  it("a real rejection is still logged as rejected and creates nothing", async () => {
    state.candidates = [{ category: "Food", a: "Tacos", a_emoji: "🌮", b: "Sushi", b_emoji: "🍣", description: "Dinner." }];
    state.verdicts = [{ outcome: "rejected", reason: "Not allowed" }];
    const out: any = await runGenerator({ force: true });
    expect(out.created).toEqual([]);
    expect(rows("moderation_log")).toEqual([expect.objectContaining({ verdict: "rejected", reason: "Not allowed" })]);
  });
});

describe("shout-outs at checkout", () => {
  const input = { sideId: "12345678-1234-4234-8234-123456789abc", pack: 5, name: "Sam", shout: "Go tacos", returnUrl: "https://tugg.lol/m/x", turnstileToken: "tok" };
  it("an unavailable check hands the words back to the buyer before payment; no order is created", async () => {
    state.verdicts = [{ outcome: "unavailable", reason: "Moderation failed" }];
    const r: any = await buyImmediateBundle({ data: input } as any);
    expect(r.error).toMatch(/couldn't check your name and shout-out/);
    expect(r.error).toMatch(/Nothing was charged/);
    expect(rows("dodo_orders")).toEqual([]);
  });
  it("a rejected shout-out is still dropped and checkout continues", async () => {
    state.verdicts = [{ outcome: "rejected", reason: "Rude" }];
    const r: any = await buyImmediateBundle({ data: input } as any);
    expect(r.error).toBeUndefined();
    expect(rows("dodo_orders")).toEqual([expect.objectContaining({ display_name: "", shout_out: "" })]);
  });
});
