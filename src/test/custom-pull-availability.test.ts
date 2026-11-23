// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator() { return this; }, handler(fn: () => unknown) { return fn; } }) }));
import { getPaymentStatus } from "@/lib/payments.functions";
import { productId } from "@/lib/payments/dodo.server";

beforeEach(() => {
  vi.stubEnv("PAYMENT_PROVIDER", "dodo");
  vi.stubEnv("PAYMENTS_ENV", "sandbox");
  vi.stubEnv("PULL_BASKET_ENABLED", "false");
  for (const mode of ["TEST", "LIVE"]) {
    vi.stubEnv(`DODO_${mode}_API_KEY`, `fixture-${mode}-key`);
    vi.stubEnv(`DODO_${mode}_WEBHOOK_SECRET`, `fixture-${mode}-secret`);
    for (const kind of ["PULL_5", "PULL_10", "PULL_25", "STANDARD", "FEATURED"]) vi.stubEnv(`DODO_${mode}_PRODUCT_${kind}`, `fixture-${mode}-${kind}`);
  }
  vi.stubEnv("DODO_TEST_PRODUCT_PULL_CUSTOM", "");
  vi.stubEnv("DODO_LIVE_PRODUCT_PULL_CUSTOM", "fixture-live-custom");
});
afterEach(() => vi.unstubAllEnvs());

it("missing test product never falls back to live and leaves fixed checkout ready", async () => {
  expect(await getPaymentStatus()).toMatchObject({ environment: "sandbox", ready: true, customAvailable: false });
  expect(() => productId("pull_custom")).toThrow("not configured");
});
it("live custom availability uses the live product independently of missing test configuration", async () => {
  vi.stubEnv("PAYMENTS_ENV", "live");
  expect(await getPaymentStatus()).toMatchObject({ environment: "live", ready: true, customAvailable: true });
  expect(productId("pull_custom")).toBe("fixture-live-custom");
});