import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import type { PaymentProvider, VerifiedPayment } from "./provider";
import { parseBasketMetadata } from "./basket";

type Event = { type: string; data: { payment_id: string; refund_id?: string | undefined } };
type Order = { id: string; kind: string; environment: string; wallet_id: string | null; status: string; product_id: string; expected_cents: number; quantity: number; basket_refund_cents: number; refund_status: string | null };
function checked(result: { error: { message: string } | null }) {
  if (result.error) throw new Error("Payment processing unavailable");
}
export const BASKET_REFUND_REASON = "Tugg matchup no longer running when your payment was applied";

/** Facts read from Dodo's API (never from the webhook body or the browser) for apply_dodo_basket to check. */
export function basketFacts(payment: VerifiedPayment) {
  const parsed = parseBasketMetadata(payment.metadata);
  return {
    currency: payment.currency,
    cents: payment.total_amount,
    cart_lines: payment.product_cart.length,
    product_id: payment.product_cart[0]?.product_id ?? null,
    cart_quantity: payment.product_cart[0]?.quantity ?? null,
    checkout_id: payment.checkout_session_id ?? null,
    meta_pulls: parsed?.pulls ?? null,
    lines: parsed?.lines ?? null,
    country: payment.billing?.country || "",
  };
}

/** Basket orders: the caller already holds the order lease and verified payment identity. */
export async function processBasketEvent(event: Event, payment: VerifiedPayment, order: Order, provider: PaymentProvider) {
  const id = order.id;
  if (order.wallet_id || order.environment !== provider.environment || payment.metadata["tugg_environment"] !== provider.environment || payment.metadata["tugg_kind"] !== "basket")
    throw new Error("Payment does not match order");
  if (event.type.startsWith("dispute.")) {
    checked(await db.from("events").insert({ kind: "dodo_dispute", detail: { paymentId: payment.payment_id, type: event.type } }));
    try { await (await import("../app-email.server")).sendOwnerAlert("dispute", id, provider.environment); } catch { /* dispute processing unchanged */ }
    return;
  }
  if (event.type === "payment.failed") {
    if (payment.status !== "failed" && payment.status !== "cancelled") throw new Error("Failure not confirmed");
    checked(await db.from("dodo_orders").update({ status: "failed" }).eq("id", id).eq("status", "pending"));
    return;
  }
  if (event.type === "refund.failed" || event.type === "refund.succeeded") {
    if (!event.data.refund_id) throw new Error("Refund reference missing");
    const refund = provider.refundStatus ? await provider.refundStatus(event.data.refund_id) : payment.refunds?.find((r) => r.refund_id === event.data.refund_id);
    if (refund && "payment_id" in refund && refund.payment_id !== payment.payment_id) throw new Error("Refund payment mismatch");
    if (!refund || refund.status !== (event.type === "refund.succeeded" ? "succeeded" : "failed")) throw new Error("Refund not verified");
    if (event.type === "refund.succeeded" && (refund.currency !== "USD" || refund.amount !== order.basket_refund_cents)) throw new Error("Refund amount or currency mismatch");
    checked(await db.from("dodo_orders").update({ refund_id: event.data.refund_id, refund_status: event.type === "refund.succeeded" ? "succeeded" : "failed" }).eq("id", id));
    if (event.type === "refund.failed") {
      try { await (await import("../app-email.server")).sendOwnerAlert("refund_review", id, provider.environment); } catch { /* refund outcome unchanged */ }
    }
    checked(await db.from("events").insert({ kind: event.type === "refund.failed" ? "refund_error" : "dodo_refund", detail: { orderId: id, refundId: event.data.refund_id } }));
    return;
  }
  if (event.type !== "payment.succeeded") return;
  if (["failed", "expired"].includes(order.status)) {
    checked(await db.from("events").insert({ kind: "dodo_late_payment_review", detail: { orderId: id, environment: provider.environment } }));
    return;
  }
  if (payment.status !== "succeeded") throw new Error("Payment not confirmed");
  if (order.status === "pending") {
    // Every integrity check and every pull happen inside this one locked SQL transaction.
    checked(await db.rpc("apply_dodo_basket", { p_order: id, p_payment: payment.payment_id, p_env: provider.environment, p_facts: basketFacts(payment) }));
  }
  const fresh = await db.from("dodo_orders").select("status,basket_refund_cents,refund_status,product_id").eq("id", id).single();
  checked(fresh);
  const row = fresh.data;
  if (!row || row.status !== "paid" || row.basket_refund_cents <= 0 || row.refund_status) return;
  // Dodo refund idempotency is undocumented: claim once durably, never blindly retry an ambiguous POST.
  const claim = await db.from("dodo_orders").update({ refund_status: "requesting" }).eq("id", id).is("refund_status", null).select("id").maybeSingle();
  checked(claim);
  if (!claim.data) return;
  try {
    const refund = await provider.refund(payment.payment_id, id, { itemId: row.product_id, cents: row.basket_refund_cents, reason: BASKET_REFUND_REASON });
    checked(await db.from("dodo_orders").update({ refund_id: refund.refundId, refund_status: refund.status }).eq("id", id));
  } catch {
    checked(await db.from("dodo_orders").update({ refund_status: "needs_review" }).eq("id", id));
    checked(await db.from("events").insert({ kind: "refund_error", detail: { orderId: id, reason: "Dodo partial basket refund needs verification before retry" } }));
  }
}
