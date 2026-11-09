// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  verify: vi.fn(), checkout: vi.fn(), validate: vi.fn(), rpc: vi.fn(), writes: [] as any[],
  order: {} as any, fresh: {} as any, refundClaim: true, basket: true,
}));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator(v: any) { this.v = v; return this; }, handler(fn: any) { const v = (this as any).v; return (arg: any) => fn({ data: v ? v(arg.data) : arg.data }); } }) }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://tugg.lol/m/a"), getRequestIP: () => "local-fixture" }));
vi.mock("@/lib/turnstile.server", () => ({ verifyTurnstileForRequest: state.verify }));
vi.mock("@/lib/payments/selection.server", () => ({
  basketActive: () => state.basket, paymentReadiness: () => {},
  selectedProvider: () => ({ environment: "sandbox", validateProduct: state.validate, checkout: state.checkout }),
}));
vi.mock("@/lib/payments/dodo.server", () => ({ productId: (k: string) => `pdt-${k}` }));
vi.mock("@/lib/server-utils.server", () => ({
  config: () => ({ pausePulls: process.env["PAUSE_PULLS"] === "true", paymentProvider: "dodo", paymentsEnv: "sandbox" }),
  moderate: vi.fn(async () => ({ allowed: true, reason: "ok" })),
  publicDb: () => ({}),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: state.rpc,
    from(table: string) {
      const q: any = {
        select: () => q, eq: () => q, is: () => q,
        insert(v: any) { state.writes.push({ table, value: v }); return q; },
        update(v: any) { state.writes.push({ table, value: v }); return q; },
        async single() { return { error: null, data: state.fresh.status ? state.fresh : state.order }; },
        async maybeSingle() { const c = state.refundClaim; state.refundClaim = false; return { error: null, data: c ? { id: state.order.id } : null }; },
        then(r: any) { r({ error: null, data: null }); },
      };
      return q;
    },
  },
}));
import { buyPullBasket } from "@/lib/basket-payments.functions";
import { processDodoEvent } from "@/lib/payments/fulfillment.server";
import { encodeBasketMetadata } from "@/lib/payments/basket";
import type { PaymentProvider } from "@/lib/payments/provider";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-1234-4234-8234-123456789abc`;
const lines = [{ matchupId: uuid(1), sideId: uuid(101), pulls: 7 }, { matchupId: uuid(2), sideId: uuid(102), pulls: 6 }, { matchupId: uuid(3), sideId: uuid(103), pulls: 4 }];
const input = (l: unknown = lines) => ({ data: { lines: l, name: "", shout: "", returnUrl: "https://tugg.lol/m/a", turnstileToken: "fixture" } });
const orderId = uuid(9);

beforeEach(() => {
  vi.unstubAllEnvs();
  state.basket = true; state.writes = []; state.refundClaim = true; state.fresh = {};
  state.verify.mockReset(); state.validate.mockReset();
  state.checkout.mockReset().mockResolvedValue({ sessionId: "cs-fixture", url: "https://test.checkout.dodopayments.com/cs" });
  state.rpc.mockReset().mockImplementation(async (name: string, args: any) => {
    if (name === "take_checkout_slot" || name === "claim_dodo_immediate_order") return { data: true, error: null };
    if (name === "create_dodo_basket") return { data: args.p_lines.reduce((s: number, l: any) => s + l.quantity, 0), error: null };
    return { data: { duplicate: false }, error: null };
  });
});

describe("basket checkout", () => {
  it("17 pulls across 3 matchups is one $17 checkout of the $1 product", async () => {
    const r = await buyPullBasket(input());
    expect(r).toMatchObject({ provider: "dodo", total: 17 });
    expect(state.validate).toHaveBeenCalledWith("pdt-pull_1", 100);
    expect(state.checkout).toHaveBeenCalledTimes(1);
    const call = state.checkout.mock.calls[0]![0];
    expect(call).toMatchObject({ productId: "pdt-pull_1", quantity: 17 });
    expect(call.metadata).toMatchObject({ tugg_pulls: "17", tugg_lines: "3", tugg_l0: `${uuid(1)}:${uuid(101)}:7` });
    const created = state.rpc.mock.calls.find((c) => c[0] === "create_dodo_basket")![1];
    expect(created.p_lines).toEqual([{ matchup_id: uuid(1), side_id: uuid(101), quantity: 7 }, { matchup_id: uuid(2), side_id: uuid(102), quantity: 6 }, { matchup_id: uuid(3), side_id: uuid(103), quantity: 4 }]);
    expect(state.writes.some((w) => w.table.includes("wallet"))).toBe(false);
  });
  it.each([
    ["both sides of one matchup", [{ matchupId: uuid(1), sideId: uuid(101), pulls: 5 }, { matchupId: uuid(1), sideId: uuid(201), pulls: 5 }]],
    ["under $5", [{ matchupId: uuid(1), sideId: uuid(101), pulls: 4 }]],
    ["over $500", [{ matchupId: uuid(1), sideId: uuid(101), pulls: 300 }, { matchupId: uuid(2), sideId: uuid(102), pulls: 201 }]],
    ["11 matchups", Array.from({ length: 11 }, (_, i) => ({ matchupId: uuid(i + 1), sideId: uuid(100 + i), pulls: 1 }))],
  ])("rejects %s before any side effect", async (_, l) => {
    expect(await buyPullBasket(input(l))).toHaveProperty("error");
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.checkout).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("flag off: the basket endpoint refuses everything", async () => {
    state.basket = false;
    expect(await buyPullBasket(input())).toHaveProperty("error");
    expect(state.checkout).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("PAUSE_PULLS blocks basket checkout", async () => {
    vi.stubEnv("PAUSE_PULLS", "true");
    expect(await buyPullBasket(input())).toHaveProperty("error", "Pulls are paused right now. Please try again later.");
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.checkout).not.toHaveBeenCalled();
  });
  it("failed Turnstile creates nothing", async () => {
    state.verify.mockRejectedValue(new Error("Security check failed"));
    expect(await buyPullBasket(input())).toHaveProperty("error", "Security check failed");
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.checkout).not.toHaveBeenCalled();
  });
  it("database rule violations become a friendly error and no checkout", async () => {
    state.rpc.mockImplementation(async (name: string) => name === "create_dodo_basket" ? { data: null, error: { message: "basket:matchup_unavailable" } } : { data: true, error: null });
    expect(await buyPullBasket(input())).toHaveProperty("error", "One of these matchups is no longer accepting pulls. Remove it and try again.");
    expect(state.checkout).not.toHaveBeenCalled();
  });
});

function basketPayment(metadata = encodeBasketMetadata(orderId, "sandbox", lines), overrides: Record<string, unknown> = {}) {
  return { payment_id: "pay-fixture", status: "succeeded", currency: "USD", total_amount: 1700, metadata, product_cart: [{ product_id: "pdt-unit", quantity: 17 }], billing: { country: "US" }, checkout_session_id: "cs-fixture", ...overrides };
}
function provider(payment: any): PaymentProvider {
  return { environment: "sandbox", validateProduct: vi.fn(), checkout: vi.fn(), payment: vi.fn(async () => payment), refund: vi.fn(async () => ({ refundId: "refund-fixture", status: "pending" })), refundStatus: vi.fn(async (id: string) => ({ refund_id: id, payment_id: "pay-fixture", status: "succeeded", amount: 600, currency: "USD" })) };
}
const succeeded = { type: "payment.succeeded", data: { payment_id: "pay-fixture" } };

describe("basket confirmation", () => {
  beforeEach(() => {
    state.order = { id: orderId, kind: "basket", environment: "sandbox", wallet_id: null, status: "pending", product_id: "pdt-unit", expected_cents: 1700, quantity: 17, basket_refund_cents: 0, refund_status: null, checkout_id: "cs-fixture" };
  });
  it("applies the whole basket through one SQL call with facts read from Dodo", async () => {
    await processDodoEvent(succeeded, provider(basketPayment()));
    const calls = state.rpc.mock.calls.filter((c) => c[0] === "apply_dodo_basket");
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toMatchObject({ p_order: orderId, p_payment: "pay-fixture", p_env: "sandbox", p_facts: { currency: "USD", cents: 1700, cart_lines: 1, product_id: "pdt-unit", cart_quantity: 17, meta_pulls: 17, checkout_id: "cs-fixture" } });
    expect(calls[0]![1].p_facts.lines).toHaveLength(3);
    expect(state.rpc.mock.calls.some((c) => c[0] === "apply_dodo_bundle" || c[0] === "record_pull")).toBe(false);
  });
  it("tampered metadata claiming 30 pulls on a $17 payment is passed as-is for the database to refuse", async () => {
    const tampered = encodeBasketMetadata(orderId, "sandbox", [{ ...lines[0]!, pulls: 20 }, lines[1]!, lines[2]!]);
    await processDodoEvent(succeeded, provider(basketPayment(tampered)));
    const facts = state.rpc.mock.calls.find((c) => c[0] === "apply_dodo_basket")![1].p_facts;
    expect(facts.meta_pulls).toBe(30);
    expect(facts.cents).toBe(1700);
    expect(facts.cart_quantity).toBe(17);
  });
  it("garbled metadata sends no allocation (held for review in the database)", async () => {
    await processDodoEvent(succeeded, provider(basketPayment({ tugg_order_id: orderId, tugg_environment: "sandbox", tugg_kind: "basket", tugg_lines: "3", tugg_pulls: "17", tugg_l0: "x" })));
    expect(state.rpc.mock.calls.find((c) => c[0] === "apply_dodo_basket")![1].p_facts.lines).toBeNull();
  });
  it("wrong-environment metadata applies nothing", async () => {
    const meta = { ...encodeBasketMetadata(orderId, "sandbox", lines), tugg_environment: "live" };
    await expect(processDodoEvent(succeeded, provider(basketPayment(meta)))).rejects.toThrow();
    expect(state.rpc.mock.calls.some((c) => c[0] === "apply_dodo_basket")).toBe(false);
  });
  it("unconfirmed payment applies nothing", async () => {
    await expect(processDodoEvent(succeeded, provider(basketPayment(undefined, { status: "processing" })))).rejects.toThrow("Payment not confirmed");
    expect(state.rpc.mock.calls.some((c) => c[0] === "apply_dodo_basket")).toBe(false);
  });
  it("closed matchup portion is refunded once, partially, even across replay", async () => {
    state.fresh = { status: "paid", basket_refund_cents: 600, refund_status: null, product_id: "pdt-unit" };
    const p = provider(basketPayment());
    await processDodoEvent(succeeded, p);
    state.order.status = "paid";
    await processDodoEvent(succeeded, p);
    expect(p.refund).toHaveBeenCalledTimes(1);
    expect(p.refund).toHaveBeenCalledWith("pay-fixture", orderId, expect.objectContaining({ itemId: "pdt-unit", cents: 600 }));
    expect(state.rpc.mock.calls.filter((c) => c[0] === "apply_dodo_basket")).toHaveLength(1);
  });
  it("ambiguous partial refund is held for review, not retried", async () => {
    state.fresh = { status: "paid", basket_refund_cents: 600, refund_status: null, product_id: "pdt-unit" };
    const p = provider(basketPayment());
    p.refund = vi.fn().mockRejectedValue(new Error("network"));
    await processDodoEvent(succeeded, p);
    expect(state.writes).toContainEqual({ table: "dodo_orders", value: { refund_status: "needs_review" } });
  });
  it("refund.succeeded must match the partial amount owed", async () => {
    state.order = { ...state.order, status: "paid", basket_refund_cents: 500 };
    await expect(processDodoEvent({ type: "refund.succeeded", data: { payment_id: "pay-fixture", refund_id: "ref" } }, provider(basketPayment()))).rejects.toThrow("Refund amount");
    state.order.basket_refund_cents = 600;
    await processDodoEvent({ type: "refund.succeeded", data: { payment_id: "pay-fixture", refund_id: "ref" } }, provider(basketPayment()));
    expect(state.writes).toContainEqual({ table: "dodo_orders", value: { refund_id: "ref", refund_status: "succeeded" } });
  });
  it("a basket held for review is never applied or refunded automatically", async () => {
    state.order.status = "needs_review";
    state.fresh = { status: "needs_review", basket_refund_cents: 0, refund_status: null, product_id: "pdt-unit" };
    const p = provider(basketPayment());
    await processDodoEvent(succeeded, p);
    expect(state.rpc.mock.calls.some((c) => c[0] === "apply_dodo_basket")).toBe(false);
    expect(p.refund).not.toHaveBeenCalled();
  });
});
