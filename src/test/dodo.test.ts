// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyDodoSignature } from "@/lib/payments/signature";
import { createDodoProvider, dodoSettings } from "@/lib/payments/dodo.server";
import { PRODUCTS, spendOptions } from "@/lib/payments/catalog";
import { hashWalletToken, newWalletToken } from "@/lib/payments/wallet";
const fixture = Buffer.from("public-unit-test-signing-fixture").toString("base64");
const now = 1800000000000;
function signed(raw: string, seconds = now / 1000, id = "evt_fixture") {
  const signature = createHmac("sha256", Buffer.from(fixture, "base64"))
    .update(`${id}.${seconds}.${raw}`)
    .digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(seconds),
    "webhook-signature": `v1,${signature}`,
  });
}
afterEach(() => vi.unstubAllEnvs());
describe("Standard Webhooks verification", () => {
  it("accepts a real HMAC signature over the untouched body", async () => {
    const raw = '{"type":"payment.succeeded"}';
    expect(await verifyDodoSignature(raw, signed(raw), `whsec_${fixture}`, now)).toBe(
      "evt_fixture",
    );
  });
  it("rejects a tampered body", async () => {
    await expect(verifyDodoSignature("tampered", signed("original"), fixture, now)).rejects.toThrow(
      "Invalid signature",
    );
  });
  it("rejects timestamp older than five minutes", async () => {
    await expect(
      verifyDodoSignature("body", signed("body", now / 1000 - 301), fixture, now),
    ).rejects.toThrow("Expired");
  });
  it("rejects a future timestamp beyond five minutes", async () => {
    await expect(
      verifyDodoSignature("body", signed("body", now / 1000 + 301), fixture, now),
    ).rejects.toThrow("Expired");
  });
  it("accepts the exact 300-second boundary", async () => {
    expect(await verifyDodoSignature("body", signed("body", now / 1000 - 300), fixture, now)).toBe(
      "evt_fixture",
    );
  });
  it("rejects a different environment secret", async () => {
    await expect(
      verifyDodoSignature(
        "body",
        signed("body"),
        Buffer.from("different-public-fixture").toString("base64"),
        now,
      ),
    ).rejects.toThrow("Invalid signature");
  });
  it("binds the webhook id to the signature", async () => {
    const h = signed("body");
    h.set("webhook-id", "other");
    await expect(verifyDodoSignature("body", h, fixture, now)).rejects.toThrow();
  });
  it("accepts a repeated signed ID but returns the same ID for durable deduplication", async () => {
    expect(await verifyDodoSignature("body", signed("body"), fixture, now)).toBe(
      await verifyDodoSignature("body", signed("body"), fixture, now),
    );
  });
});
describe("Dodo provider with mocked HTTP", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMENTS_ENV", "sandbox");
    vi.stubEnv("DODO_TEST_API_KEY", "public-test-api-fixture");
    vi.stubEnv("DODO_TEST_WEBHOOK_SECRET", fixture);
  });
  it.each([
    ["pull_5", 500, 5],
    ["pull_10", 1000, 10],
    ["pull_25", 2500, 25],
    ["standard", 900, 0],
    ["featured", 2900, 0],
  ] as const)("keeps %s at exact requested price and entitlement", (kind, cents, pulls) => {
    expect(PRODUCTS[kind].cents).toBe(cents);
    expect(PRODUCTS[kind].pulls).toBe(pulls);
  });
  it("posts fixed USD checkout with one item and no UPI or currency selector", async () => {
    const http = vi.fn(async () =>
      Response.json({
        session_id: "cs_fixture",
        checkout_url: "https://checkout.dodopayments.com/test",
      }),
    );
    const p = createDodoProvider(http);
    expect(
      await p.checkout({ productId: "p5", orderId: "order", returnUrl: "https://tugg.lol/m/test" }),
    ).toEqual({ sessionId: "cs_fixture", url: "https://checkout.dodopayments.com/test" });
    const call = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://test.dodopayments.com/checkouts");
    const body = JSON.parse(String(call[1].body));
    expect(body.billing_currency).toBe("USD");
    expect(body.product_cart).toEqual([{ product_id: "p5", quantity: 1 }]);
    expect(body.feature_flags.allow_currency_selection).toBe(false);
    expect(body.feature_flags.allow_discount_code).toBe(false);
    expect(body.allowed_payment_method_types).toEqual([
      "credit",
      "debit",
      "apple_pay",
      "google_pay",
      "cashapp",
    ]);
  });
  it("validates exact tax inclusive one-time USD product", async () => {
    await expect(
      createDodoProvider(async () =>
        Response.json({
          price: { type: "one_time_price", currency: "USD", price: 500, tax_inclusive: true },
        }),
      ).validateProduct("p5", 500),
    ).resolves.toBeUndefined();
  });
  it.each([
    { currency: "INR" },
    { price: 499 },
    { tax_inclusive: false },
    { pay_what_you_want: true },
    { purchasing_power_parity: true },
    { discount_bps: 100 },
  ])("rejects mismatched product %j", async (change) => {
    const p = createDodoProvider(async () =>
      Response.json({
        price: {
          type: "one_time_price",
          currency: "USD",
          price: 500,
          tax_inclusive: true,
          ...change,
        },
      }),
    );
    await expect(p.validateProduct("p5", 500)).rejects.toThrow("exact");
  });
  it("fails closed without keys", () => {
    vi.stubEnv("DODO_TEST_API_KEY", "");
    expect(() => createDodoProvider()).toThrow("not configured");
  });
  it("live does not fall back to test credentials", () => {
    vi.stubEnv("PAYMENTS_ENV", "live");
    vi.stubEnv("DODO_LIVE_API_KEY", "");
    expect(() => createDodoProvider()).toThrow("not configured");
  });
  it("rejects identical configured test and live credentials", () => {
    vi.stubEnv("DODO_LIVE_API_KEY", "public-test-api-fixture");
    expect(() => dodoSettings()).toThrow();
  });
  it("rejects wrong-host provider authentication", async () => {
    const p = createDodoProvider(async () => new Response("Unauthorized", { status: 401 }));
    await expect(p.validateProduct("p5", 500)).rejects.toThrow("not configured");
  });
  it("posts refunds using verified payment id", async () => {
    const http = vi.fn(async () => Response.json({ refund_id: "ref_fixture", status: "pending" }));
    expect(await createDodoProvider(http).refund("pay_fixture", "order_fixture")).toEqual({
      refundId: "ref_fixture",
      status: "pending",
    });
    const call = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://test.dodopayments.com/refunds");
    expect(JSON.parse(String(call[1].body)).payment_id).toBe("pay_fixture");
  });
  it("shows only affordable 1, 5 and 10 spends", () => {
    expect(spendOptions(0)).toEqual([]);
    expect(spendOptions(4)).toEqual([1]);
    expect(spendOptions(5)).toEqual([1, 5]);
    expect(spendOptions(10)).toEqual([1, 5, 10]);
  });
  it("generates recovery credentials and hashes consistently", async () => {
    const token = newWalletToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashWalletToken(token)).toBe(await hashWalletToken(token));
    expect(await hashWalletToken(token)).not.toBe(token);
  });
});
