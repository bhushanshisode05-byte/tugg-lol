import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../server-utils.server";
import { loadMatchups } from "../tugg.functions";
import type { PaymentReceipt, ReceiptLine } from "./confirmation";

type Order = { id: string; kind: string; quantity: number; expected_cents: number; basket_refund_cents: number; side_id: string | null };

/** Receipt for a paid order from public matchup data only: no buyer email, display name or payment references. */
export async function dodoReceipt(db: SupabaseClient<any>, order: Order): Promise<PaymentReceipt | null> {
  let parts: { matchupId: string; sideId: string; pulls: number }[] = [];
  if (order.kind === "basket") {
    const lines = await db.from("dodo_basket_lines").select("matchup_id,side_id,quantity,status,position").eq("order_id", order.id).order("position");
    if (lines.error) throw new Error("Receipt unavailable");
    parts = (lines.data ?? []).filter((l: any) => l.status === "applied").map((l: any) => ({ matchupId: l.matchup_id, sideId: l.side_id, pulls: l.quantity }));
  } else if (order.side_id) {
    const side = await db.from("sides").select("id,matchup_id").eq("id", order.side_id).single();
    if (side.error || !side.data) throw new Error("Receipt unavailable");
    parts = [{ matchupId: side.data.matchup_id, sideId: side.data.id, pulls: order.quantity }];
  }
  const matchups = parts.length ? await loadMatchups({ ids: [...new Set(parts.map((p) => p.matchupId))] }) : [];
  const byId = new Map(matchups.map((m) => [m.id, m]));
  const lines: ReceiptLine[] = parts.flatMap((p) => {
    const m = byId.get(p.matchupId);
    if (!m || !m.sides.some((s) => s.id === p.sideId)) return [];
    return [{ matchupId: m.id, slug: m.slug, title: m.title, sides: m.sides, sideId: p.sideId, pulls: p.pulls, totalA: m.round?.total_a_cents ?? 0, totalB: m.round?.total_b_cents ?? 0 }];
  });
  return { amountCents: order.expected_cents, pulls: order.quantity, refundedPulls: Math.floor(order.basket_refund_cents / 100), lines, siteUrl: config().siteUrl || "https://tugg.lol" };
}
