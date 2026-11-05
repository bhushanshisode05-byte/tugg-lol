// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  order: {} as any,
  matchup: {} as any,
  updates: [] as any[],
  rpc: vi.fn(),
  allowed: true,
  refundClaim: true,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: state.rpc,
    from(table: string) {
      let update: any,
        filters: any[] = [];
      const q: any = {
        select() {
          return q;
        },
        update(value: any) {
          update = value;
          state.updates.push({ table, value });
          return q;
        },
        insert(value: any) {
          state.updates.push({ table, value });
          return q;
        },
        eq(k: string, v: any) {
          filters.push([k, v]);
          return q;
        },
        is() {
          return q;
        },
        async single() {
          return { error: null, data: table === "dodo_orders" ? state.order : state.matchup };
        },
        async maybeSingle() {
          const claimed = state.refundClaim;
          state.refundClaim = false;
          return { error: null, data: claimed ? { id: state.order.id } : null };
        },
        then(resolve: any) {
          resolve({ error: null, data: null });
        },
      };
      return q;
    },
  },
}));
vi.mock("@/lib/server-utils.server", () => ({
  moderate: vi.fn(async () => ({
    allowed: state.allowed,
    reason: state.allowed ? "ok" : "Rejected fixture",
  })),
}));
import { processDodoEvent } from "@/lib/payments/fulfillment.server";
import type { PaymentProvider } from "@/lib/payments/provider";
const id = "12345678-1234-4234-8234-123456789abc";
const payment = () => ({
  payment_id: "pay-fixture",
  status: "succeeded",
  currency: "USD",
  total_amount: state.order.expected_cents,
  metadata: { tugg_order_id: id, tugg_environment: "sandbox" },
  product_cart: [{ product_id: "prod-fixture", quantity: 1 }],
  billing: { country: "US" },
  checkout_session_id: "cs-fixture",
});
function provider(): PaymentProvider {
  return {
    environment: "sandbox",
    validateProduct: vi.fn(),
    checkout: vi.fn(),
    payment: vi.fn(async () => payment()),
    refund: vi.fn(async () => ({ refundId: "refund-fixture", status: "pending" })),
  };
}
beforeEach(() => {
  state.order = {
    id,
    environment: "sandbox",
    kind: "standard",
    expected_cents: 900,
    product_id: "prod-fixture",
    checkout_id: "cs-fixture",
    payment_id: null,
    wallet_id: null,
    side_id: null,
    status: "pending",
    matchup_id: id,
    review_allowed: null,
    refund_status: null,
    created_at: "2026-11-01T00:00:00Z",
  };
  state.matchup = {
    id,
    title: "A vs B",
    description: "",
    status: "pending_payment",
    sides: [
      { name: "A", position: 0 },
      { name: "B", position: 1 },
    ],
  };
  state.updates = [];
  state.allowed = true;
  state.refundClaim = true;
  state.rpc.mockReset().mockResolvedValue({ error: null, data: true });
});
describe("mocked Dodo fulfillment", () => {
  it.each([
    ["pull_5", 500],
    ["pull_10", 1000],
    ["pull_25", 2500],
  ])("applies %s through atomic immediate SQL only", async (kind, cents) => {
    state.order.kind = kind;
    state.order.expected_cents = cents;
    state.order.side_id = id;
    state.order.quantity = cents/100;
    await processDodoEvent(
      { type: "payment.succeeded", data: { payment_id: "pay-fixture" } },
      provider(),
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "apply_dodo_bundle",
      expect.objectContaining({ p_payment: "pay-fixture", p_cents: cents, p_env: "sandbox" }),
    );
  });
  it("activates approved paid matchup and opens its round", async () => {
    await processDodoEvent(
      { type: "payment.succeeded", data: { payment_id: "pay-fixture" } },
      provider(),
    );
    expect(state.updates).toContainEqual({
      table: "matchups",
      value: { status: "active", featured_until: null },
    });
    expect(state.rpc).toHaveBeenCalledWith("ensure_open_round", { p_matchup: id });
  });
  it("refunds rejected matchup once even across replay", async () => {
    state.allowed = false;
    const p = provider();
    const event = { type: "payment.succeeded", data: { payment_id: "pay-fixture" } };
    await processDodoEvent(event, p);
    await processDodoEvent(event, p);
    expect(p.refund).toHaveBeenCalledTimes(1);
    expect(p.refund).toHaveBeenCalledWith("pay-fixture", id);
    expect(state.updates).toContainEqual({ table: "matchups", value: { status: "rejected" } });
  });
  it("logs ambiguous refund outcome rather than blindly retrying", async () => {
    state.allowed = false;
    const p = provider();
    p.refund = vi.fn().mockRejectedValue(new Error("network"));
    await processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay-fixture" } }, p);
    expect(state.updates).toContainEqual({
      table: "dodo_orders",
      value: { refund_status: "needs_review" },
    });
  });
  it("records a dispute without creating a wallet balance", async () => {
    await processDodoEvent(
      { type: "dispute.opened", data: { payment_id: "pay-fixture" } },
      provider(),
    );
    expect(state.updates.some(r => r.table === "events" && r.value.kind === "dodo_dispute")).toBe(true);
    expect(state.updates.some(r => r.table === "pull_wallets")).toBe(false);
  });
  it("refuses a payment in another environment", async () => {
    state.order.environment = "live";
    await expect(
      processDodoEvent(
        { type: "payment.succeeded", data: { payment_id: "pay-fixture" } },
        provider(),
      ),
    ).rejects.toThrow("match");
    expect(state.rpc).not.toHaveBeenCalledWith("apply_dodo_bundle", expect.anything());
  });
  it("refuses wrong amount or checkout", async () => {
    const p = provider();
    p.payment = vi.fn(async () => ({ ...payment(), total_amount: 1 }));
    await expect(
      processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay-fixture" } }, p),
    ).rejects.toThrow("match");
  });
  it("records failed payment without pulls", async () => {
    const failed = provider();
    failed.payment = vi.fn(async()=>({...payment(),status:"failed"}));
    await processDodoEvent(
      { type: "payment.failed", data: { payment_id: "pay-fixture" } },
      failed,
    );
    expect(state.updates).toContainEqual({ table: "dodo_orders", value: { status: "failed" } });
    expect(state.rpc).not.toHaveBeenCalledWith("apply_dodo_bundle", expect.anything());
  });
});

it.each(["failed","expired"])("late success on %s never applies pulls", async status => {
  state.order.status=status; state.order.side_id=id; state.order.kind="pull_5";state.order.quantity=5;state.order.expected_cents=500;
  await processDodoEvent({type:"payment.succeeded",data:{payment_id:"pay-fixture"}},provider());
  expect(state.rpc).not.toHaveBeenCalledWith("apply_dodo_bundle",expect.anything());
});
it("refuses legacy wallet orders",async()=>{
  state.order.wallet_id=id;
  await expect(processDodoEvent({type:"payment.succeeded",data:{payment_id:"pay-fixture"}},provider())).rejects.toThrow("match");
  expect(state.rpc).not.toHaveBeenCalledWith("credit_dodo_wallet",expect.anything());
});
it.each(["succeeded","failed"])("verifies refund %s via Dodo API",async status=>{
  const p=provider();p.refundStatus=vi.fn(async()=>({refund_id:"r",payment_id:"pay-fixture",status,currency:"USD",amount:900}));
  await processDodoEvent({type:`refund.${status}`,data:{payment_id:"pay-fixture",refund_id:"r"}},p);
  expect(p.refundStatus).toHaveBeenCalledWith("r");
  expect(state.updates).toContainEqual({table:"dodo_orders",value:{refund_id:"r",refund_status:status}});
});
it("refuses refund belonging to a different payment",async()=>{
  const p=provider();p.refundStatus=vi.fn(async()=>({refund_id:"r",payment_id:"wrong",status:"succeeded"}));
  await expect(processDodoEvent({type:"refund.succeeded",data:{payment_id:"pay-fixture",refund_id:"r"}},p)).rejects.toThrow("mismatch");
});
