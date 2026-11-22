import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { config, moderate } from "../server-utils.server";
import { fixedProductCents } from "./catalog";
import type { PaymentProvider, VerifiedPayment } from "./provider";
import { normalizePayglocal, payglocalSettings, createPayglocalProvider } from "./payglocal.server";
import { decodePayglocalHint, verifyPayglocalToken } from "./payglocal-crypto";
function checked(result: { error: unknown }) { if (result.error) throw new Error("Payment processing unavailable"); }
const failures = new Set(["ISSUER_DECLINE", "GENERAL_DECLINE", "CUSTOMER_CANCELLED", "ABANDONED", "REQUEST_ERROR", "FAILED", "EXPIRED"]);
export function paymentMatches(payment: VerifiedPayment, order: { gid: string | null; merchant_unique_id: string; environment: string; expected_cents: number }, merchantId: string) {
  return payment.payment_id === order.gid && payment.metadata["tugg_environment"] === order.environment &&
    payment.currency === "USD" && payment.total_amount === order.expected_cents &&
    (payment.metadata["merchantTxnId"] === order.merchant_unique_id || payment.metadata["merchantUniqueId"] === order.merchant_unique_id) &&
    (payment.metadata["merchantId"] == null || payment.metadata["merchantId"] === merchantId);
}
export async function processPayglocalOrder(id: string, provider: PaymentProvider, verified?: VerifiedPayment, reconcile = false) {
  const key = crypto.randomUUID();
  const claim = await db.rpc("claim_payglocal_order", { p_order: id, p_env: provider.environment, p_key: key });
  checked(claim); if (!claim.data) return { busy: true };
  try {
    const result = await db.from("payglocal_orders").select("*").eq("id", id).eq("environment", provider.environment).single(); checked(result);
    const o = result.data; if (!o) throw new Error("Payment order unavailable");
    if (o.status === "expired" || o.status === "failed") {
      // Terminal unpaid orders never acquire pulls from a late or contradictory callback.
      if (verified?.status === "SENT_FOR_CAPTURE") {
        checked(await db.from("events").insert({ kind: "payglocal_late_capture_review", detail: { orderId: id, environment: provider.environment } }));
        try { await (await import('../app-email.server')).sendOwnerAlert('payment_error', id, provider.environment); } catch { /* outcome unchanged */ }
      }
      return { status: o.status };
    }
    if (o.status === "paid" && (o.quantity > 0 || o.review_allowed === true || o.refund_status)) return { status: "paid", duplicate: true };
    const payment = verified ?? await provider.payment(o.gid || o.merchant_unique_id, o.status_url);
    // Status by merchant ID recovers an initiation whose response was lost. Never retry initiate.
    if (!o.gid && payment.payment_id && (payment.metadata["merchantTxnId"] === o.merchant_unique_id || payment.metadata["merchantUniqueId"] === o.merchant_unique_id)) {
      checked(await db.from("payglocal_orders").update({ gid: payment.payment_id }).eq("id", id).is("gid", null));
      o.gid = payment.payment_id;
    }
    const merchant = payglocalSettings().merchantId;
    if (!o.gid || payment.payment_id !== o.gid || payment.metadata["tugg_environment"] !== o.environment) throw new Error("Payment identity mismatch");
    let status = o.status;
    if (payment.status === "SENT_FOR_CAPTURE") {
      if (!paymentMatches(payment, o, merchant) || o.expected_cents !== fixedProductCents(o.kind)) throw new Error("Payment does not match purchase");
      const applied = await db.rpc("apply_payglocal_payment", { p_order: id, p_gid: payment.payment_id, p_env: provider.environment, p_cents: payment.total_amount, p_country: payment.billing?.country || o.billing_country }); checked(applied);
      status = "paid";
      if (o.quantity === 0 && o.matchup_id) {
        const match = await db.from("matchups").select("id,title,description,status,sides(name,position)").eq("id", o.matchup_id).single(); checked(match);
        const m = match.data; if (!m) throw new Error("Matchup unavailable");
        if (m.status !== "active" && m.status !== "retired") {
          let allowed = o.review_allowed;
          if (allowed === null) {
            checked(await db.from("matchups").update({ status: "pending_review" }).eq("id", m.id).eq("status", "pending_payment"));
            const sides = [...m.sides].sort((a,b) => a.position-b.position);
            const content = `Title: ${m.title}\nSide A: ${sides[0]?.name}\nSide B: ${sides[1]?.name}\nDescription: ${m.description}`;
            const verdict = await moderate("matchup", content);
            // An outage is not a verdict: stay unpublished and unrefunded; the order is processed again on its next check.
            if (verdict.outcome === "unavailable") {
              checked(await db.from("events").insert({ kind: "moderation_unavailable", detail: { provider: "payglocal", orderId: id } }));
              if (reconcile) checked(await db.from("payglocal_orders").update({ reconcile_count: o.reconcile_count+1, reconciled_at: new Date().toISOString(), reconcile_result: "moderation_pending" }).eq("id", id));
              return { status: "paid" };
            }
            allowed = verdict.outcome === "allowed";
            checked(await db.from("moderation_log").insert({ subject_type: "matchup", subject_id: id, content, verdict: allowed ? "allowed" : "rejected", reason: verdict.reason }));
            checked(await db.from("payglocal_orders").update({ review_allowed: allowed, review_reason: verdict.reason }).eq("id", id));
          }
          if (allowed) {
            if (m.status === "rejected" || o.refund_status) throw new Error("Rejected matchup cannot activate");
            checked(await db.from("matchups").update({ status: "active", featured_until: o.kind === "featured" ? new Date(Date.now()+7*864e5).toISOString() : null }).eq("id", m.id).eq("status", "pending_review"));
            checked(await db.rpc("ensure_open_round", { p_matchup: m.id }));
          } else {
            checked(await db.from("matchups").update({ status: "rejected" }).eq("id", m.id));
            const refundClaim = await db.from("payglocal_orders").update({ refund_status: "requesting" }).eq("id", id).is("refund_status", null).select("id").maybeSingle(); checked(refundClaim);
            if (refundClaim.data) {
              try {
                const refund = await provider.refund(payment.payment_id, id);
                checked(await db.from("payglocal_orders").update({ refund_gid: refund.refundId, refund_status: refund.status }).eq("id", id));
              } catch {
                checked(await db.from("payglocal_orders").update({ refund_status: "needs_review" }).eq("id", id));
                checked(await db.from("events").insert({ kind: "refund_error", detail: { provider: "payglocal", orderId: id, reason: "Refund outcome needs verification; no automatic retry" } }));
              }
            }
          }
        }
      }
    } else if (o.status !== "paid") {
      // A pending/authorized payment is not proof of failure. Expire only after an authoritative check.
      status = failures.has(payment.status) ? "failed" : reconcile && Date.now()-new Date(o.created_at).getTime() >= 24*3600e3 ? "expired" : o.status;
      checked(await db.from("payglocal_orders").update({ status, provider_status: payment.status }).eq("id", id).neq("status", "paid"));
    }
    if (reconcile) checked(await db.from("payglocal_orders").update({ reconcile_count: o.reconcile_count+1, reconciled_at: new Date().toISOString(), reconcile_result: status }).eq("id", id));
    return { status };
  } finally {
    checked(await db.from("payglocal_orders").update({ processing_until: null, processing_key: null }).eq("id", id).eq("processing_key", key));
    // Email is a post-outcome observer, never payment authority or a fulfillment dependency.
    try { await (await import('../app-email.server')).sendPurchaseNotices(id, provider.environment, 'payglocal'); } catch { /* payment outcome unchanged */ }
  }
}
export async function handlePayglocalCallback(request: Request) {
  const url = new URL(request.url), c = config();
  if (c.paymentProvider !== "payglocal" || url.searchParams.get("env") !== c.paymentsEnv) return Response.json({ error: "Payment environment unavailable" }, { status: 409 });
  const id = url.searchParams.get("order"); if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid payment reference" }, { status: 400 });
  const text = await request.text(); if (text.length > 24000) return new Response("Too large", { status: 413 });
  let token = request.headers.get("x-gl-token") || "";
  try {
    if (!token) token = request.headers.get("content-type")?.includes("application/json") ? String((JSON.parse(text) as Record<string,unknown>)["x-gl-token"] || "") : new URLSearchParams(text).get("x-gl-token") || "";
    const settings = payglocalSettings();
    const provider = createPayglocalProvider();
    const stored = await db.from("payglocal_orders").select("gid,merchant_unique_id,expected_cents,environment,return_path").eq("id", id).eq("environment", c.paymentsEnv).single(); checked(stored);
    const order = stored.data; if (!order) return new Response("Unknown payment", { status: 404 });
    let verified: VerifiedPayment | undefined;
    try {
      const payload = verifyPayglocalToken(token, settings.publicCert, settings.merchantId);
      const p = normalizePayglocal(payload, c.paymentsEnv);
      if (paymentMatches(p, order, settings.merchantId)) verified = p;
    } catch {
      // Unverified fields are hints only: never use their amount, status or transaction identity.
      try { decodePayglocalHint(token); } catch { /* status uses stored gid below */ }
    }
    const result = await processPayglocalOrder(id, provider, verified);
    // Only a verified, identity-matched provider status may trigger a dispute alert.
    if (verified && ['DISPUTE','DISPUTED','CHARGEBACK','DISPUTE_OPENED'].includes(verified.status)) {
      try { await (await import('../app-email.server')).sendOwnerAlert('dispute', id, c.paymentsEnv); } catch { /* outcome unchanged */ }
    }
    if (result.busy) return new Response("Payment processing; retry", { status: 503 });
    const destination = new URL(order.return_path, url.origin);
    if (destination.origin !== url.origin) throw new Error("Invalid return address");
    return Response.redirect(destination.toString(), 303);
  } catch {
    return Response.json({ error: "Payment confirmation pending; no unverified pulls applied." }, { status: 503 });
  }
}
export async function reconcilePayglocal() {
  if (config().paymentProvider !== "payglocal") return { skipped: "provider dormant" };
  const environment = config().paymentsEnv;
  const due = await db.rpc("payglocal_reconcile_due", { p_env: environment }); checked(due);
  const batch = due.data as { rows: { id: string; reconcile_count: number }[]; expired: number } | null;
  const candidates = batch?.rows ?? [];
  let finalized=0, expired=batch?.expired ?? 0, errors=0;
  if (!candidates.length) return { checked: 0, finalized, expired, errors };
  const provider = createPayglocalProvider(fetch, 3000);
  await Promise.all(candidates.map(async (row) => {
    try { const r = await processPayglocalOrder(row.id, provider, undefined, true); if (r.status === "paid") finalized++; if (r.status === "expired") expired++; }
    catch { errors++; checked(await db.from("payglocal_orders").update({ reconciled_at: new Date().toISOString(), reconcile_count: row.reconcile_count+1, reconcile_result: "error" }).eq("id", row.id)); checked(await db.from("events").insert({ kind: "payglocal_reconcile_error", detail: { orderId: row.id } }));
      try { await (await import('../app-email.server')).sendOwnerAlert('payment_error', row.id, environment); } catch { /* payment outcome unchanged */ }
    }
  }));
  checked(await db.from("events").insert({ kind: "payglocal_reconcile", detail: { environment: provider.environment, checked: candidates.length, finalized, expired, errors } }));
  return { checked: candidates.length, finalized, expired, errors };
}