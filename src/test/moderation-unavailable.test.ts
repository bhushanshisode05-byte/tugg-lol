// @vitest-environment node
// A moderation outage is not a rejection: a paid matchup stays unpublished, unrefunded and retryable, the buyer gets
// no rejection email, and only sustained failure alerts the owner. Real rejections still refund. Runs the real
// fulfilment and receipt code over an in-memory store.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const state = vi.hoisted(() => ({ cards: {} as Record<string, any>, cardError: false, tables: {} as Record<string, any[]>, reads: [] as string[], sends: [] as any[], claims: new Set<string>(), refund: vi.fn() }));

vi.mock("@/lib/server-utils.server", () => ({
  config: () => ({ pauseEmails: false, siteUrl: "https://tugg.lol", paymentProvider: "dodo", paymentsEnv: "sandbox" }),
  moderate: vi.fn(async () => ({ outcome: "allowed", reason: "ok" })),
}));
// Run the real transactional sender; intercept only rendering and the Resend request.
let renderedData: Record<string, any> = {};
vi.mock('@react-email/render', () => ({ render: vi.fn(async (element: any) => { renderedData = element.props; return '<p>Tugg</p>'; }) }));
beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-only-resend-key');
  vi.stubEnv('TRANSACTIONAL_EMAIL_FROM', 'Tugg <receipts@updates.tugg.lol>');
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const key = new Headers(init.headers).get('Idempotency-Key') ?? '';
    const template = key.replace('tugg-transactional/', '').split(':')[0];
    state.sends.push([template, body.to[0], { templateData: renderedData }]);

    return Response.json({ id: 'test-email-id' });
  }));
});
vi.mock("@/lib/tugg.functions", () => ({
  loadMatchups: async ({ ids }: { ids: string[] }) => (state.tables["matchups"] ?? []).filter((m) => ids.includes(m.id)).map((m) => ({
    ...m, sides: (state.tables["sides"] ?? []).filter((s) => s.matchup_id === m.id), round: { total_a_cents: 0, total_b_cents: 0, round_length: "weekly" },
  })),
  // Stands in for the public card loader the image route uses: null means the card can't be drawn.
  loadPullCard: async (id: string) => { if (state.cardError) throw new Error("rpc down"); return state.cards[id] ?? null; },
}));
vi.mock("@/integrations/supabase/client.server", () => {
  // Tiny in-memory table store: filters really filter, so a wrong table or id returns nothing, just like production.
  function from(table: string) {
    state.reads.push(table);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null, inserted: Row | null = null;
    const rows = () => (state.tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (inserted) { (state.tables[table] ??= []).push(inserted); return { data: [inserted], error: null }; }
      const hit = rows();
      if (patch) for (const r of hit) Object.assign(r, patch);
      return { data: hit, error: null };
    };
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: any) => { filters.push((r) => r[k] !== v); return q; },
      is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return q; },
      update: (v: Row) => { patch = v; return q; },
      insert: (v: Row) => { inserted = v; return q; },
      async single() { const { data } = run(); return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "not found" } }; },
      async maybeSingle() { const { data } = run(); return { data: data[0] ?? null, error: null }; },
      then(resolve: any, reject: any) { try { resolve(run()); } catch (e) { reject(e); } },
    };
    return q;
  }
  const order = (id: string): Row => state.tables["dodo_orders"]!.find((o) => o["id"] === id)!;
  async function rpc(name: string, args: any) {
    if (name === "claim_tugg_notice") { if (state.claims.has(args.p_key)) return { data: "duplicate", error: null }; state.claims.add(args.p_key); return { data: "accepted", error: null }; }
    if (name === "claim_dodo_immediate_order") { Object.assign(order(args.p_order), { payment_id: args.p_payment }); return { data: true, error: null }; }
    if (name === "apply_dodo_bundle") { Object.assign(order(args.p_order), { status: "paid", paid_at: "2026-11-16T20:00:00Z" }); return { data: {}, error: null }; }
    if (name === "apply_dodo_basket") {
      const o = order(args.p_order); let refund = 0;
      for (const l of state.tables["dodo_basket_lines"]!.filter((l) => l["order_id"] === o["id"])) { if (l["inactive"]) { l["status"] = "refunded"; refund += l["quantity"] * 100; } else l["status"] = "applied"; }
      Object.assign(o, { status: "paid", paid_at: "2026-11-16T20:00:00Z", basket_refund_cents: refund });
      return { data: {}, error: null };
    }
    return { data: null, error: null };
  }
  return { supabaseAdmin: { from, rpc } };
});

import { moderate } from "@/lib/server-utils.server";
import { processDodoEvent } from "@/lib/payments/fulfillment.server";
import { MODERATION_RETRY, moderationNeedsOwner } from "@/lib/payments/moderation-retry";
import type { PaymentProvider, VerifiedPayment } from "@/lib/payments/provider";

const ORDER = "11111111-1111-4111-8111-111111111111";
const M = "a0000000-0000-4000-8000-000000000009";
const BUYER = "buyer@example.com";
const HOUR = 3600_000;
const order = () => state.tables["dodo_orders"]![0]!;
const matchup = () => state.tables["matchups"]![0]!;
const sent = () => state.sends.map((s) => s[0]);
const pay: VerifiedPayment = { payment_id: "pay_0NabcDEF123", status: "succeeded", currency: "USD", total_amount: 900, metadata: { tugg_order_id: ORDER, tugg_environment: "sandbox" }, product_cart: [{ product_id: "pdt_std", quantity: 1 }], checkout_session_id: "cks_SECRET", customer: { email: BUYER } } as VerifiedPayment;
const provider = (): PaymentProvider => ({ environment: "sandbox", validateProduct: vi.fn(), checkout: vi.fn(), payment: vi.fn(async () => pay), refund: state.refund });
const deliver = () => processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_0NabcDEF123" } }, provider());
const unavailable = () => vi.mocked(moderate).mockResolvedValue({ outcome: "unavailable", reason: "Moderation error 503" });
const verdict = (outcome: "allowed" | "rejected", reason = outcome === "allowed" ? "Fun rivalry" : "Politicians are not allowed") => vi.mocked(moderate).mockResolvedValue({ outcome, reason });

beforeEach(() => {
  state.tables = {}; state.sends = []; state.claims.clear(); state.refund.mockReset().mockResolvedValue({ refundId: "rfd_1", status: "pending" });
  state.tables["matchups"] = [{ id: M, slug: "tacos-vs-sushi", title: "Tacos vs Sushi", description: "Dinner", status: "pending_payment", sides: [{ name: "Tacos", position: 0 }, { name: "Sushi", position: 1 }] }];
  state.tables["dodo_orders"] = [{
    id: ORDER, environment: "sandbox", kind: "standard", expected_cents: 900, quantity: 0, product_id: "pdt_std", wallet_id: null, matchup_id: M, side_id: null,
    checkout_id: "cks_SECRET", payment_id: null, status: "pending", refund_id: null, refund_status: null, review_allowed: null, review_reason: null,
    created_at: new Date().toISOString(), paid_at: null, buyer_email: null, basket_refund_cents: 0,
    moderation_failures: 0, moderation_first_failed_at: null, moderation_alerted_at: null,
  }];
});

describe("a moderation error on a paid matchup", () => {
  it("leaves the order paid and retryable: no refund, no rejection email, not published, no fake verdict", async () => {
    unavailable();
    await deliver();
    expect(order()).toMatchObject({ status: "paid", review_allowed: null, refund_status: null, moderation_failures: 1 });
    expect(order()["moderation_first_failed_at"]).toEqual(expect.any(String));
    expect(matchup()["status"]).toBe("pending_review");
    expect(state.refund).not.toHaveBeenCalled();
    expect(sent()).toEqual(["purchase-receipt"]);
    expect(sent()).not.toContain("matchup-rejection");
    expect(state.tables["moderation_log"] ?? []).toEqual([]);
    expect(state.tables["events"]).toContainEqual({ kind: "moderation_unavailable", detail: { orderId: ORDER, environment: "sandbox", attempt: 1 } });
  });

  it("is retried by the next check and goes live once moderation answers", async () => {
    unavailable();
    await deliver();
    verdict("allowed");
    await deliver();
    expect(matchup()["status"]).toBe("active");
    expect(order()).toMatchObject({ review_allowed: true, refund_status: null });
    expect(state.refund).not.toHaveBeenCalled();
    expect(sent()).not.toContain("matchup-rejection");
  });

  it("a real rejection still rejects, refunds once and sends the rejection email", async () => {
    unavailable();
    await deliver();
    verdict("rejected");
    await deliver();
    await deliver();
    expect(matchup()["status"]).toBe("rejected");
    expect(order()).toMatchObject({ review_allowed: false, review_reason: "Politicians are not allowed" });
    expect(state.refund).toHaveBeenCalledTimes(1);
    expect(sent()).toContain("matchup-rejection");
    expect(state.tables["moderation_log"]).toEqual([expect.objectContaining({ verdict: "rejected", reason: "Politicians are not allowed" })]);
  });
});

describe("sustained moderation failure", () => {
  it("needs several attempts spread over a few hours", () => {
    const now = Date.parse("2026-11-19T12:00:00Z"), at = (h: number) => new Date(now - h * HOUR).toISOString();
    expect(MODERATION_RETRY).toEqual({ alertAfterFailures: 6, alertAfterMs: 3 * HOUR });
    expect(moderationNeedsOwner(6, at(3), now)).toBe(true);
    expect(moderationNeedsOwner(5, at(5), now)).toBe(false);
    expect(moderationNeedsOwner(20, at(2.9), now)).toBe(false);
    expect(moderationNeedsOwner(6, null, now)).toBe(false);
  });

  it("alerts the owner once instead of rejecting, and keeps the order unpublished and unrefunded", async () => {
    unavailable();
    Object.assign(order(), { status: "paid", payment_id: "pay_0NabcDEF123", moderation_failures: 5, moderation_first_failed_at: new Date(Date.now() - 4 * HOUR).toISOString() });
    matchup()["status"] = "pending_review";
    await deliver();
    expect(sent().filter((k) => k === "owner-alert")).toHaveLength(1);
    const alert = state.sends.find((s) => s[0] === "owner-alert")![2].templateData;
    expect(alert.paragraphs[0]).toMatch(/not published and has not been refunded/);
    expect(alert.details).toContainEqual({ label: "Internal reference", value: ORDER });
    expect(order()["moderation_alerted_at"]).toEqual(expect.any(String));
    expect(state.tables["events"]).toContainEqual(expect.objectContaining({ kind: "moderation_needs_owner" }));
    await deliver();
    expect(sent().filter((k) => k === "owner-alert")).toHaveLength(1);
    expect(order()).toMatchObject({ review_allowed: null, refund_status: null, moderation_failures: 7 });
    expect(matchup()["status"]).toBe("pending_review");
    expect(state.refund).not.toHaveBeenCalled();
    expect(sent()).not.toContain("matchup-rejection");
  });

  it("a short outage never alerts the owner", async () => {
    unavailable();
    Object.assign(order(), { moderation_failures: 9, moderation_first_failed_at: new Date(Date.now() - HOUR).toISOString() });
    await deliver();
    expect(sent()).not.toContain("owner-alert");
  });
});
