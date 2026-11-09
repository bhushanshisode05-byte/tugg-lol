import { z } from "zod";
import { config } from "../server-utils.server";
import { DODO_NOT_READY, type PaymentsEnv, type ProductKind } from "./catalog";
import type { PaymentProvider } from "./provider";

export function dodoSettings(env: PaymentsEnv = config().paymentsEnv) {
  if (env !== config().paymentsEnv) throw new Error(DODO_NOT_READY);
  const { prefix, key, secret, otherKey, otherSecret } = config().dodo;
  // Reject swapped known credentials. Dodo's mode-specific host is the authoritative key validator.
  if (
    !key ||
    !secret ||
    key === otherKey ||
    secret === otherSecret
  )
    throw new Error(DODO_NOT_READY);
  return {
    key,
    secret,
    base: env === "sandbox" ? "https://test.dodopayments.com" : "https://live.dodopayments.com",
    prefix,
  };
}
export function productId(kind: ProductKind | "pull_1") {
  dodoSettings();
  const id = config().dodo.products[kind];
  if (!id) throw new Error(DODO_NOT_READY);
  return id;
}
const paymentSchema = z.object({
  payment_id: z.string().min(1).max(200),
  status: z.string(),
  currency: z.string(),
  total_amount: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).default({}),
  product_cart: z.array(z.object({ product_id: z.string(), quantity: z.number().int() })).max(20).nullable().transform(v=>v ?? []),
  billing: z.object({ country: z.string().max(2).optional() }).optional(),
  checkout_session_id: z.string().nullable().optional(),
  customer: z.object({ email: z.string() }).optional(),
  created_at: z.string().optional(),
  refunds: z
    .array(
      z.object({
        refund_id: z.string(),
        status: z.string(),
        amount: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
      }),
    )
    .optional(),
});
export function createDodoProvider(fetchImpl: typeof fetch = fetch, timeoutMs = 15000): PaymentProvider {
  const environment = config().paymentsEnv;
  const settings = dodoSettings(environment);
  async function api(path: string, body?: unknown, idempotency?: string) {
    const response = await fetchImpl(`${settings.base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${settings.key}`,
        "Content-Type": "application/json",
        ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? DODO_NOT_READY
          : "Dodo is unavailable. Please try again shortly.",
      );
    return response.json();
  }
  return {
    environment,
    async validateProduct(id, cents) {
      const product = await api(`/products/${encodeURIComponent(id)}`);
      const p = product.price;
      if (
        !p ||
        p.type !== "one_time_price" ||
        p.currency !== "USD" ||
        p.price !== cents ||
        p.pay_what_you_want ||
        p.purchasing_power_parity ||
        p.discount ||
        p.discount_bps ||
        p.tax_inclusive !== true
      )
        throw new Error(
          "Dodo product must have the exact tax-inclusive one-time USD price. No payment has been taken.",
        );
    },
    async checkout(input) {
      const result = await api(
        "/checkouts",
        {
          product_cart: [{ product_id: input.productId, quantity: input.quantity ?? 1 }],
          billing_currency: "USD",
          allowed_payment_method_types: ["credit", "debit", "apple_pay", "google_pay", "cashapp"],
          feature_flags: {
            allow_currency_selection: false,
            allow_discount_code: false,
            allow_tax_id: false,
          },
          metadata: { ...(input.metadata ?? {}), tugg_order_id: input.orderId, tugg_environment: environment },
          return_url: input.returnUrl,
        },
        `checkout-${input.orderId}`,
      );
      const parsed = z
        .object({ session_id: z.string().min(1), checkout_url: z.string().url() })
        .parse(result);
      const host = new URL(parsed.checkout_url);
      if (
        host.protocol !== "https:" ||
        !(host.hostname === "dodopayments.com" || host.hostname.endsWith(".dodopayments.com"))
      )
        throw new Error("Invalid Dodo checkout destination.");
      return { sessionId: parsed.session_id, url: parsed.checkout_url };
    },
    async checkoutStatus(id) {
      return z.object({ payment_id: z.string().nullable().optional(), payment_status: z.string().nullable().optional() }).parse(await api(`/checkouts/${encodeURIComponent(id)}`));
    },
    async refundStatus(id) {
      return z.object({ refund_id: z.string(), payment_id: z.string(), status: z.string(), amount: z.number().int().nullable().optional(), currency: z.string().nullable().optional() }).parse(await api(`/refunds/${encodeURIComponent(id)}`));
    },
    async payment(id) {
      const payment = paymentSchema.parse(await api(`/payments/${encodeURIComponent(id)}`));
      if (payment.payment_id !== id) throw new Error("Payment identity mismatch");
      return payment;
    },
    async refund(paymentId, orderId, partial) {
      const result = await api(
        "/refunds",
        {
          payment_id: paymentId,
          reason: partial?.reason ?? "Tugg matchup rejected by moderation",
          metadata: { tugg_order_id: orderId },
          // Partial refunds name the product line and the tax-inclusive amount in cents.
          ...(partial ? { items: [{ item_id: partial.itemId, amount: partial.cents, tax_inclusive: true }] } : {}),
        },
        `refund-${orderId}`,
      );
      const parsed = z.object({ refund_id: z.string(), status: z.string() }).parse(result);
      return { refundId: parsed.refund_id, status: parsed.status };
    },
  };
}
