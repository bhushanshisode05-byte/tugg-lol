import { z } from "zod";
import type { VerifiedPayment } from "./provider";

type Order = { id: string; environment: string; checkout_id: string | null };
const email = z.string().trim().toLowerCase().max(254).email().refine((v) => !/[\r\n]/.test(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));

/** The buyer email Dodo (merchant of record) returns on a succeeded payment that provably belongs to this order. */
export function buyerEmailFrom(payment: VerifiedPayment, order: Order): string | null {
  if (payment.status !== "succeeded") return null;
  if (payment.metadata["tugg_order_id"] !== order.id || payment.metadata["tugg_environment"] !== order.environment) return null;
  if (!order.checkout_id || payment.checkout_session_id !== order.checkout_id) return null;
  const parsed = email.safeParse(payment.customer?.email);
  return parsed.success ? parsed.data : null;
}

type Db = { from: (t: "dodo_orders") => any };
/** Private, best-effort and first-write-wins: never throws, never affects fulfilment, never logs the address. */
export async function storeBuyerEmail(db: Db, payment: VerifiedPayment, order: Order) {
  try {
    const value = buyerEmailFrom(payment, order);
    if (!value) return;
    await db.from("dodo_orders").update({ buyer_email: value }).eq("id", order.id).is("buyer_email", null);
  } catch { /* Email capture is optional; the payment outcome is unchanged. */ }
}
