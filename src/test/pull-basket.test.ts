// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/server-utils.server";
import { basketActive, paymentReadiness } from "@/lib/payments/selection.server";
import { createDodoProvider } from "@/lib/payments/dodo.server";
import {
  BASKET_MAX_MATCHUPS, DODO_METADATA_LIMITS, basketLinesSchema, encodeBasketMetadata, parseBasketMetadata, splitPulls,
} from "@/lib/payments/basket";
import { activePaymentCopy, pullOfferFooter } from "@/lib/payments/copy";
import { supportAnswers } from "@/lib/policies";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-1234-4234-8234-123456789abc`;
const line = (i: number, pulls: number) => ({ matchupId: uuid(i), sideId: uuid(100 + i), pulls });
function dodoEnv(extra: Record<string, string> = {}) {
  vi.stubEnv("PAYMENT_PROVIDER", "dodo");
  vi.stubEnv("PAYMENTS_ENV", "");
  vi.stubEnv("DODO_TEST_API_KEY", "test-key-fixture");
  vi.stubEnv("DODO_TEST_WEBHOOK_SECRET", "test-secret-fixture");
  vi.stubEnv("DODO_LIVE_API_KEY", "");
  vi.stubEnv("DODO_LIVE_WEBHOOK_SECRET", "");
  for (const k of ["PULL_5", "PULL_10", "PULL_25", "STANDARD", "FEATURED"]) vi.stubEnv(`DODO_TEST_PRODUCT_${k}`, `pdt_${k}`);
  vi.stubEnv("DODO_TEST_PRODUCT_PULL_1", "pdt_unit");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}
afterEach(() => vi.unstubAllEnvs());

describe("PULL_BASKET_ENABLED flag", () => {
  it("is off by default", () => {
    vi.stubEnv("PULL_BASKET_ENABLED", "");
    expect(config().pullBasket).toBe(false);
    dodoEnv();
    expect(basketActive()).toBe(false);
  });
  it("turns on only for Dodo", () => {
    dodoEnv({ PULL_BASKET_ENABLED: "true" });
    expect(basketActive()).toBe(true);
    vi.stubEnv("PAYMENT_PROVIDER", "payglocal");
    expect(basketActive()).toBe(false);
  });
  it("requires the $1 product only while on", () => {
    dodoEnv({ DODO_TEST_PRODUCT_PULL_1: "" });
    expect(() => paymentReadiness()).not.toThrow();
    vi.stubEnv("PULL_BASKET_ENABLED", "true");
    expect(() => paymentReadiness()).toThrow(/not configured/);
  });
});

describe("basket rules", () => {
  it("accepts $5 and $500 and rejects $4 and $501", () => {
    expect(basketLinesSchema.safeParse([line(1, 5)]).success).toBe(true);
    expect(basketLinesSchema.safeParse([line(1, 500)]).success).toBe(true);
    expect(basketLinesSchema.safeParse([line(1, 4)]).success).toBe(false);
    expect(basketLinesSchema.safeParse([line(1, 300), line(2, 201)]).success).toBe(false);
  });
  it("rejects fractional pulls", () => {
    expect(basketLinesSchema.safeParse([line(1, 5.5)]).success).toBe(false);
  });
  it("allows a matchup only once, so both sides of one rope cannot be bought together", () => {
    const both = [{ matchupId: uuid(1), sideId: uuid(101), pulls: 5 }, { matchupId: uuid(1), sideId: uuid(102), pulls: 5 }];
    expect(basketLinesSchema.safeParse(both).success).toBe(false);
  });
  it("caps the basket at 10 matchups", () => {
    expect(BASKET_MAX_MATCHUPS).toBe(10);
    expect(basketLinesSchema.safeParse(Array.from({ length: 10 }, (_, i) => line(i, 1))).success).toBe(true);
    expect(basketLinesSchema.safeParse(Array.from({ length: 11 }, (_, i) => line(i, 1))).success).toBe(false);
  });
  it("splits a total evenly with extra pulls first", () => {
    expect(splitPulls(17, 3)).toEqual([6, 6, 5]);
    expect(splitPulls(25, 1)).toEqual([25]);
  });
  it("a full 10-matchup basket fits inside Dodo's metadata limits", () => {
    const meta = encodeBasketMetadata(uuid(9), "sandbox", Array.from({ length: 10 }, (_, i) => line(i, 50)));
    const keys = Object.keys(meta);
    expect(keys.length).toBeLessThanOrEqual(DODO_METADATA_LIMITS.keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(DODO_METADATA_LIMITS.keyLength);
    expect(Math.max(...Object.values(meta).map((v) => v.length))).toBeLessThanOrEqual(DODO_METADATA_LIMITS.valueLength);
    expect(keys.every((k) => /^[A-Za-z0-9_-]+$/.test(k))).toBe(true);
  });
  it("round-trips metadata and refuses malformed or extra lines", () => {
    const lines = [line(1, 7), line(2, 6), line(3, 4)];
    const meta = encodeBasketMetadata(uuid(9), "sandbox", lines);
    expect(parseBasketMetadata(meta)).toEqual({ pulls: 17, lines: lines.map((l) => ({ matchup_id: l.matchupId, side_id: l.sideId, quantity: l.pulls })) });
    expect(parseBasketMetadata({ ...meta, tugg_l1: "garbage" })).toBeNull();
    expect(parseBasketMetadata({ ...meta, tugg_l3: `${uuid(4)}:${uuid(104)}:9` })).toBeNull();
  });
});

describe("Dodo requests for a basket", () => {
  it("creates one checkout of the $1 product with quantity = total pulls", async () => {
    dodoEnv({ PULL_BASKET_ENABLED: "true" });
    const fetchMock = vi.fn(async () => Response.json({ session_id: "cs_1", checkout_url: "https://test.checkout.dodopayments.com/cs_1" }));
    const provider = createDodoProvider(fetchMock as unknown as typeof fetch);
    const lines = [line(1, 7), line(2, 6), line(3, 4)];
    await provider.checkout({ productId: "pdt_unit", orderId: uuid(9), returnUrl: "https://tugg.lol/m/a", quantity: 17, metadata: encodeBasketMetadata(uuid(9), "sandbox", lines) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.product_cart).toEqual([{ product_id: "pdt_unit", quantity: 17 }]);
    expect(body.billing_currency).toBe("USD");
    expect(body.metadata).toMatchObject({ tugg_order_id: uuid(9), tugg_environment: "sandbox", tugg_kind: "basket", tugg_pulls: "17", tugg_lines: "3" });
  });
  it("fixed bundles still send quantity 1 with no basket metadata", async () => {
    dodoEnv();
    const fetchMock = vi.fn(async () => Response.json({ session_id: "cs_1", checkout_url: "https://test.checkout.dodopayments.com/cs_1" }));
    await createDodoProvider(fetchMock as unknown as typeof fetch).checkout({ productId: "pdt_PULL_5", orderId: uuid(9), returnUrl: "https://tugg.lol/m/a" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.product_cart).toEqual([{ product_id: "pdt_PULL_5", quantity: 1 }]);
    expect(body.metadata).toEqual({ tugg_order_id: uuid(9), tugg_environment: "sandbox" });
  });
  it("partial refund names the $1 product line and the exact cents", async () => {
    dodoEnv();
    const fetchMock = vi.fn(async () => Response.json({ refund_id: "ref_1", status: "pending" }));
    await createDodoProvider(fetchMock as unknown as typeof fetch).refund("pay_1", uuid(9), { itemId: "pdt_unit", cents: 600, reason: "closed" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).items).toEqual([{ item_id: "pdt_unit", amount: 600, tax_inclusive: true }]);
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(`refund-${uuid(9)}`);
  });
});

describe("basket copy", () => {
  it("flag off keeps the exact fixed-bundle wording", () => {
    const text = activePaymentCopy(supportAnswers[0].text, "dodo", false);
    expect(text).toContain("Buy a one-time bundle of 5 pulls for $5, 10 for $10, or 25 for $25, in US dollars only. Choose a side before paying. After verified payment, the entire bundle is applied immediately to that side; there are no credits");
    expect(pullOfferFooter(false)).toBe("$1 per pull. One-time bundles of 5, 10 or 25 applied immediately after verified payment.");
  });
  it("flag on describes $5-$500 across up to 10 matchups, never a wallet", () => {
    const text = activePaymentCopy(supportAnswers[0].text, "dodo", true);
    expect(text).toContain("from 5 ($5) to 500 ($500)");
    expect(text).toContain("up to 10 different matchups");
    expect(text).toContain("no credits, stored balances or unused pulls");
    expect(pullOfferFooter(true)).toMatch(/^From \$5 · \$1 per pull\./);
  });
  it("PayGlocal never shows basket wording", () => {
    expect(activePaymentCopy("{{pullOffer}}", "payglocal", true)).toContain("bundle of 5 pulls for $5");
  });
});
