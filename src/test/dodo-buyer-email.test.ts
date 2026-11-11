// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const state = vi.hoisted(() => ({ order: {} as any, updates: [] as any[], rpc: vi.fn(), failEmail: false }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: state.rpc,
    from(table: string) {
      const q: any = {
        select: () => q, eq: () => q, is: () => q, order: () => q, insert: (value: any) => { state.updates.push({ table, value }); return q; },
        update(value: any) { if (state.failEmail && "buyer_email" in value) throw new Error("db down"); state.updates.push({ table, value }); return q; },
        async single() { return { error: null, data: state.order }; },
        then(resolve: any) { resolve({ error: null, data: null }); },
      };
      return q;
    },
  },
}));
vi.mock("@/lib/server-utils.server", () => ({ moderate: vi.fn(async () => ({ allowed: true, reason: "ok" })), config: () => ({ siteUrl: "https://tugg.lol" }) }));
vi.mock("@/lib/tugg.functions", () => ({ loadMatchups: async () => [{ id: "m1", slug: "notion-vs-obsidian", title: "Notion vs Obsidian", sides: [{ id, name: "Notion" }, { id: "s2", name: "Obsidian" }], round: { total_a_cents: 3000, total_b_cents: 500 } }] }));
import { processDodoEvent } from "@/lib/payments/fulfillment.server";
import { dodoReceipt } from "@/lib/payments/receipt.server";
import { buyerEmailFrom } from "@/lib/payments/buyer-email.server";
import type { PaymentProvider, VerifiedPayment } from "@/lib/payments/provider";

const id = "12345678-1234-4234-8234-123456789abc";
const order = () => ({ id, environment: "sandbox", kind: "pull_5", expected_cents: 500, quantity: 5, product_id: "pdt_5", checkout_id: "cks_1", payment_id: null, wallet_id: null, side_id: id, status: "pending", matchup_id: null });
const payment = (patch: Partial<VerifiedPayment> = {}): VerifiedPayment => ({ payment_id: "pay_1", status: "succeeded", currency: "USD", total_amount: 500, metadata: { tugg_order_id: id, tugg_environment: "sandbox" }, product_cart: [{ product_id: "pdt_5", quantity: 1 }], checkout_session_id: "cks_1", customer: { email: "  Buyer@Example.COM " }, ...patch });
const provider = (p: VerifiedPayment): PaymentProvider => ({ environment: "sandbox", validateProduct: vi.fn(), checkout: vi.fn(), payment: vi.fn(async () => p), refund: vi.fn() });
const emailWrites = () => state.updates.filter((u) => u.table === "dodo_orders" && "buyer_email" in u.value);
beforeEach(() => { state.order = order(); state.updates = []; state.failEmail = false; state.rpc.mockReset().mockResolvedValue({ error: null, data: true }); });

describe("private Dodo buyer email", () => {
  it("reads the email from the verified payment's customer object, normalised", () => {
    expect(buyerEmailFrom(payment(), order())).toBe("buyer@example.com");
  });
  it.each([
    ["another order", { metadata: { tugg_order_id: "other", tugg_environment: "sandbox" } }],
    ["the other environment", { metadata: { tugg_order_id: id, tugg_environment: "live" } }],
    ["another checkout", { checkout_session_id: "cks_other" }],
    ["a payment that did not succeed", { status: "failed" }],
    ["no customer", { customer: undefined }],
    ["an invalid address", { customer: { email: "not-an-email" } }],
    ["a header-injection attempt", { customer: { email: "a@b.co\r\nbcc:x@y.z" } }],
  ])("is not stored for %s", (_label, patch) => {
    expect(buyerEmailFrom(payment(patch as Partial<VerifiedPayment>), order())).toBeNull();
  });
  it("a succeeded webhook stores it once against the order and fulfilment runs exactly as before", async () => {
    await processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_1" } }, provider(payment()));
    expect(emailWrites()).toEqual([{ table: "dodo_orders", value: { buyer_email: "buyer@example.com" } }]);
    expect(state.rpc).toHaveBeenCalledWith("apply_dodo_bundle", { p_order: id, p_payment: "pay_1", p_country: "", p_env: "sandbox", p_cents: 500 });
  });
  it("a failure saving the email never blocks applying the pulls", async () => {
    state.failEmail = true;
    await processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_1" } }, provider(payment()));
    expect(state.rpc).toHaveBeenCalledWith("apply_dodo_bundle", expect.objectContaining({ p_order: id }));
  });
  it("failed payments store nothing", async () => {
    await processDodoEvent({ type: "payment.failed", data: { payment_id: "pay_1" } }, provider(payment({ status: "failed" })));
    expect(emailWrites()).toEqual([]);
  });
});

describe("the buyer email cannot leak publicly", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
  const app = files("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("src/test/") && !f.startsWith("src/integrations/"));
  it("only the private capture module and the existing PayGlocal write/receipt paths mention it", () => {
    expect(app.filter((f) => readFileSync(f, "utf8").includes("buyer_email")).sort()).toEqual([
      "src/lib/app-email.server.ts", "src/lib/immediate-payments.functions.ts", "src/lib/payments/buyer-email.server.ts", "src/lib/tugg.functions.ts",
    ]);
  });
  it("no public route, feed, share image, leaderboard or Hall of Fame code touches it", () => {
    const publicCode = app.filter((f) => f.startsWith("src/routes/") || f.startsWith("src/lib/og/") || /feeds|sitemap|recap|leaderboard|hall-of-fame|share/.test(f));
    expect(publicCode.length).toBeGreaterThan(10);
    for (const f of publicCode) expect(readFileSync(f, "utf8")).not.toMatch(/buyer_email|customer\??\.email/);
  });
  it("the payment status read selects named public columns only, never the email", () => {
    const src = readFileSync("src/lib/immediate-payments.functions.ts", "utf8");
    const dodoSelect = src.match(/from\("dodo_orders"\)\.select\("([^"]+)"\)/g) ?? [];
    expect(dodoSelect.length).toBe(1);
    expect(dodoSelect[0]).not.toMatch(/buyer_email|\*/);
  });
  it("the webhook still stores no customer details", () => {
    const src = readFileSync("src/routes/api/public/payments/dodo/webhook.ts", "utf8");
    expect(src).not.toMatch(/data\.customer|customer:/);
  });
});

it("the receipt is built from public matchup data and never carries the email or payment references", async () => {
  const pullId = "7f000000-0000-4000-8000-000000000001";
  const db: any = { from: (table: string) => { const q: any = { select: () => q, eq: () => q, order: () => q,
    in: async () => ({ error: null, data: table === "pulls" ? [{ id: pullId, stripe_session_id: `dodo:${id}`, round_a_after_cents: 3000, round_b_after_cents: 500 }] : [] }),
    single: async () => ({ error: null, data: { id, matchup_id: "m1", buyer_email: "buyer@example.com" } }) }; return q; } };
  const receipt = await dodoReceipt(db, { id, kind: "pull_5", quantity: 5, expected_cents: 500, basket_refund_cents: 0, side_id: id });
  const text = JSON.stringify(receipt);
  expect(receipt?.lines[0]).toMatchObject({ slug: "notion-vs-obsidian", pulls: 5, totalA: 3000, sideId: id, pull: { id: pullId, totalA: 3000, totalB: 500 } });
  // The pull lookup key (which embeds the order id) never reaches the browser.
  expect(text).not.toContain("dodo:");
  expect(text).not.toMatch(/@|buyer|pay_|cks_/);
});
