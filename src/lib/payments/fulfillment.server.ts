import { z } from "zod";
import { PRODUCTS } from "./catalog";
import type { PaymentProvider, VerifiedPayment } from "./provider";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { moderate } from "../server-utils.server";

export const webhookPayload = z
  .object({
    type: z.string().min(1).max(100),
    data: z
      .object({
        payment_id: z.string().min(1).max(200),
        refund_id: z.string().max(200).optional(),
        amount: z.number().int().nonnegative().nullable().optional(),
        currency: z.string().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();
type Event = z.infer<typeof webhookPayload>;
function checked(result: { error: { message: string } | null }) {
  if (result.error) throw new Error("Payment processing unavailable");
}
export async function processDodoEvent(event: Event, provider: PaymentProvider, verified?: VerifiedPayment) {
  if (
    !["payment.succeeded", "payment.failed", "refund.succeeded", "refund.failed"].includes(
      event.type,
    ) &&
    !event.type.startsWith("dispute.")
  )
    return;
  const payment = verified ?? await provider.payment(event.data.payment_id);
  if (payment.payment_id !== event.data.payment_id) throw new Error("Payment identity mismatch");
  const id = z.string().uuid().parse(payment.metadata["tugg_order_id"]);
  const key = crypto.randomUUID();
  const lock = await db.rpc("claim_dodo_immediate_order", {
    p_order: id,
    p_payment: payment.payment_id,
    p_env: provider.environment,
    p_key: key,
  });
  checked(lock);
  if (!lock.data) throw new Error("Payment already processing; retry");
  try {
    const result = await db.from("dodo_orders").select("*").eq("id", id).single();
    checked(result);
    const order = result.data;
    if (
      !order ||
      order.wallet_id ||
      order.environment !== provider.environment ||
      payment.metadata["tugg_environment"] !== provider.environment ||
      payment.currency !== "USD" ||
      payment.total_amount !== order.expected_cents ||
      payment.product_cart.length !== 1 ||
      payment.product_cart[0]?.product_id !== order.product_id ||
      payment.product_cart[0]?.quantity !== 1 ||
      order.expected_cents !== PRODUCTS[order.kind as keyof typeof PRODUCTS]?.cents ||
      payment.checkout_session_id !== order.checkout_id ||
      (order.payment_id && order.payment_id !== payment.payment_id)
    )
      throw new Error("Payment does not match order");
    if (["failed", "expired"].includes(order.status) && event.type === "payment.succeeded") {
      checked(await db.from("events").insert({ kind: "dodo_late_payment_review", detail: { orderId: id, environment: provider.environment } }));
      return;
    }
    if (event.type.startsWith("dispute.")) {
      if (order.wallet_id)
        checked(await db.from("pull_wallets").update({ flagged: true }).eq("id", order.wallet_id));
      checked(
        await db
          .from("events")
          .insert({
            kind: "dodo_dispute",
            detail: { paymentId: payment.payment_id, type: event.type },
          }),
      );
      try { await (await import('../app-email.server')).sendOwnerAlert('dispute', id, provider.environment); } catch { /* dispute processing unchanged */ }
      return;
    }
    if (event.type === "payment.failed") {
      if (payment.status !== "failed" && payment.status !== "cancelled") throw new Error("Failure not confirmed");
      checked(
        await db
          .from("dodo_orders")
          .update({ status: "failed" })
          .eq("id", id)
          .eq("status", "pending"),
      );
      return;
    }
    if (event.type === "refund.failed" || event.type === "refund.succeeded") {
      if (!event.data.refund_id) throw new Error("Refund reference missing");
      const refund = provider.refundStatus ? await provider.refundStatus(event.data.refund_id) : payment.refunds?.find((r) => r.refund_id === event.data.refund_id);
      if (refund && "payment_id" in refund && refund.payment_id !== payment.payment_id) throw new Error("Refund payment mismatch");
      if (!refund || refund.status !== (event.type === "refund.succeeded" ? "succeeded" : "failed"))
        throw new Error("Refund not verified");
      if (event.type === "refund.succeeded" && order.wallet_id) {
        if (refund.currency !== "USD" || refund.amount == null)
          throw new Error("Refund currency or amount missing");
        checked(
          await db.rpc("refund_dodo_wallet", {
            p_order: id,
            p_refund: event.data.refund_id,
            p_cents: refund.amount,
          }),
        );
      }
      checked(
        await db
          .from("dodo_orders")
          .update({
            refund_id: event.data.refund_id,
            refund_status: event.type === "refund.succeeded" ? "succeeded" : "failed",
          })
          .eq("id", id),
      );
      if (event.type === "refund.succeeded")
        checked(await db.from("creators").update({ refunded: true }).eq("dodo_order_id", id));
      if (event.type === 'refund.failed') {
        try { await (await import('../app-email.server')).sendOwnerAlert('refund_review', id, provider.environment); } catch { /* refund outcome unchanged */ }
      }
      checked(
        await db
          .from("events")
          .insert({
            kind: event.type === "refund.failed" ? "refund_error" : "dodo_refund",
            detail: { orderId: id, refundId: event.data.refund_id },
          }),
      );
      return;
    }
    if (event.type !== "payment.succeeded") return;
    if (payment.status !== "succeeded") throw new Error("Payment not confirmed");
    if (order.side_id) {
      checked(
        await db.rpc("apply_dodo_bundle", {
          p_order: id,
          p_payment: payment.payment_id,
          p_country: payment.billing?.country || "",
          p_env: provider.environment,
          p_cents: payment.total_amount,
        }),
      );
      return;
    }
    if (!order.matchup_id) throw new Error("Matchup unavailable");
    checked(
      await db
        .from("dodo_orders")
        .update({ payment_id: payment.payment_id, status: "paid", paid_at: order.paid_at || new Date().toISOString(), provider_status: payment.status })
        .eq("id", id),
    );
    checked(
      await db
        .from("creators")
        .update({ dodo_payment_id: payment.payment_id })
        .eq("dodo_order_id", id),
    );
    const match = await db
      .from("matchups")
      .select("id,title,description,status,sides(name,position)")
      .eq("id", order.matchup_id)
      .single();
    checked(match);
    const m = match.data;
    if (!m) throw new Error("Matchup unavailable");
    if (m.status === "active" || m.status === "retired") return;
    let allowed = order.review_allowed;
    if (allowed === null) {
      checked(
        await db
          .from("matchups")
          .update({ status: "pending_review" })
          .eq("id", m.id)
          .eq("status", "pending_payment"),
      );
      const sides = [...m.sides].sort((a, b) => a.position - b.position);
      const text = `Title: ${m.title}\nSide A: ${sides[0]?.name}\nSide B: ${sides[1]?.name}\nDescription: ${m.description}`;
      const verdict = await moderate("matchup", text);
      allowed = verdict.allowed;
      checked(
        await db
          .from("moderation_log")
          .insert({
            subject_type: "matchup",
            subject_id: id,
            content: text,
            verdict: allowed ? "allowed" : "rejected",
            reason: verdict.reason,
          }),
      );
      checked(
        await db
          .from("dodo_orders")
          .update({ review_allowed: allowed, review_reason: verdict.reason })
          .eq("id", id),
      );
    }
    if (allowed) {
      if (m.status === "rejected" || order.refund_status)
        throw new Error("Rejected matchup cannot activate");
      checked(
        await db
          .from("matchups")
          .update({
            status: "active",
            featured_until:
              order.kind === "featured" ? new Date(Date.now() + 7 * 864e5).toISOString() : null,
          })
          .eq("id", m.id)
          .eq("status", "pending_review"),
      );
      checked(await db.rpc("ensure_open_round", { p_matchup: m.id }));
      return;
    }
    checked(await db.from("matchups").update({ status: "rejected" }).eq("id", m.id));
    // Dodo refund idempotency is undocumented: claim once durably, never blindly retry an ambiguous POST.
    const claim = await db
      .from("dodo_orders")
      .update({ refund_status: "requesting" })
      .eq("id", id)
      .is("refund_status", null)
      .select("id")
      .maybeSingle();
    checked(claim);
    if (!claim.data) return;
    try {
      const refund = await provider.refund(payment.payment_id, id);
      checked(
        await db
          .from("dodo_orders")
          .update({ refund_id: refund.refundId, refund_status: refund.status })
          .eq("id", id),
      );
      if (refund.status === "succeeded")
        checked(await db.from("creators").update({ refunded: true }).eq("dodo_order_id", id));
    } catch {
      checked(await db.from("dodo_orders").update({ refund_status: "needs_review" }).eq("id", id));
      checked(
        await db
          .from("events")
          .insert({
            kind: "refund_error",
            detail: { orderId: id, reason: "Dodo refund outcome needs verification before retry" },
          }),
      );
    }
  } finally {
    checked(await db.from("dodo_orders").update({ processing_until: null, processing_key: null }).eq("id", id).eq("processing_key", key));
  }
}
