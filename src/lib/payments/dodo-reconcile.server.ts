import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { config } from "../server-utils.server";
import { createDodoProvider } from "./dodo.server";
import { processDodoEvent } from "./fulfillment.server";

export async function reconcileDodo() {
  if (config().paymentProvider !== "dodo") return { skipped: "provider dormant" };
  const environment = config().paymentsEnv;
  const due = await db.rpc("dodo_reconcile_due", { p_env: environment });
  if (due.error) throw new Error("Reconciliation unavailable");
  const batch = due.data as { rows: { id: string; checkout_id: string; payment_id: string | null; reconcile_count: number }[]; expired: number } | null;
  const candidates = batch?.rows ?? [];
  let finalized = 0, errors = 0;
  if (!candidates.length) return { checked: 0, finalized, expired: batch?.expired ?? 0, errors };
  const provider = createDodoProvider(fetch, 3000);
  await Promise.all(candidates.map(async row => {
    let result = "pending";
    try {
      const session = await provider.checkoutStatus?.(row.checkout_id);
      const paymentId = row.payment_id || session?.payment_id;
      if (paymentId) {
        if (session?.payment_id && row.payment_id && session.payment_id !== row.payment_id) throw new Error("Payment identity mismatch");
        const payment = await provider.payment(paymentId);
        if (payment.metadata["tugg_order_id"] !== row.id || payment.checkout_session_id !== row.checkout_id || payment.metadata["tugg_environment"] !== environment) throw new Error("Payment does not match stored order");
        if (["succeeded","failed","cancelled"].includes(payment.status)) {
          await processDodoEvent({ type: payment.status === "succeeded" ? "payment.succeeded" : "payment.failed", data: { payment_id: paymentId } }, provider, payment);
          const stored = await db.from("dodo_orders").select("status").eq("id",row.id).single();
          if (stored.error) throw new Error("Result unavailable");
          result = stored.data.status;
          if (result === "paid") finalized++;
        }
      }
    } catch { result = "error"; errors++; }
    const saved = await db.from("dodo_orders").update({ reconciled_at: new Date().toISOString(), reconcile_count: row.reconcile_count+1, reconcile_result: result }).eq("id",row.id);
    if (saved.error) throw new Error("Reconciliation result unavailable");
  }));
  const summary = { environment, checked: candidates.length, finalized, expired: batch?.expired ?? 0, errors };
  await db.from("events").insert({ kind: "dodo_reconcile", detail: summary });
  return summary;
}