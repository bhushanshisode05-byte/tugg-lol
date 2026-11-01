import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { config, moderate } from "../server-utils.server";
import { PRODUCTS } from "./catalog";
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
      if (verified?.status === "SENT_FOR_CAPTURE") checked(await db.from("events").insert({ kind: "payglocal_late_capture_review", detail: { orderId: id, environment: provider.environment } }));
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
      if (!paymentMatches(payment, o, merchant) || o.expected_cents !== PRODUCTS[o.kind as keyof typeof PRODUCTS]?.cents) throw new Error("Payment does not match purchase");
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
            const verdict = await moderate("matchup", content); allowed = verdict.allowed;
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
  const provider = createPayglocalProvider(fetch, 3000);
  const rows = await db.from("payglocal_orders").select("id").eq("environment", provider.environment)
    .or("status.eq.pending,and(status.eq.paid,quantity.eq.0,refund_status.is.null,review_allowed.is.null),and(status.eq.paid,quantity.eq.0,refund_status.is.null,review_allowed.eq.false)")
    .lt("created_at", new Date(Date.now()-5*60000).toISOString()).order("reconciled_at", { ascending: true, nullsFirst: true }).order("created_at").limit(10); checked(rows);
  let finalized=0, expired=0, errors=0;
  await Promise.all((rows.data ?? []).map(async (row) => {
    try { const r = await processPayglocalOrder(row.id, provider, undefined, true); if (r.status === "paid") finalized++; if (r.status === "expired") expired++; }
    catch { errors++; checked(await db.from("events").insert({ kind: "payglocal_reconcile_error", detail: { orderId: row.id } })); }
  }));
  checked(await db.from("events").insert({ kind: "payglocal_reconcile", detail: { environment: provider.environment, checked: rows.data?.length ?? 0, finalized, expired, errors } }));
  return { checked: rows.data?.length ?? 0, finalized, expired, errors };
}