import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../server-utils.server";
import { loadMatchups } from "../tugg.functions";
import type { PaymentReceipt, ReceiptLine, ReceiptPull } from "./confirmation";

type Order = { id: string; kind: string; quantity: number; expected_cents: number; basket_refund_cents: number; side_id: string | null };

/** Receipt for a paid order from public matchup data only: no buyer email, display name or payment references. */
export async function dodoReceipt(db: SupabaseClient<any>, order: Order): Promise<PaymentReceipt | null> {
  let parts: { matchupId: string; sideId: string; pulls: number; session: string }[] = [];
  if (order.kind === "basket") {
    const lines = await db.from("dodo_basket_lines").select("matchup_id,side_id,quantity,status,position").eq("order_id", order.id).order("position");
    if (lines.error) throw new Error("Receipt unavailable");
    parts = (lines.data ?? []).filter((l: any) => l.status === "applied").map((l: any) => ({ matchupId: l.matchup_id, sideId: l.side_id, pulls: l.quantity, session: `dodo:${order.id}:${l.position}` }));
  } else if (order.side_id) {
    const side = await db.from("sides").select("id,matchup_id").eq("id", order.side_id).single();
    if (side.error || !side.data) throw new Error("Receipt unavailable");
    parts = [{ matchupId: side.data.matchup_id, sideId: side.data.id, pulls: order.quantity, session: `dodo:${order.id}` }];
  }
  const matchups = parts.length ? await loadMatchups({ ids: [...new Set(parts.map((p) => p.matchupId))] }) : [];
  const byId = new Map(matchups.map((m) => [m.id, m]));
  const pulls = await recordedPulls(db, parts.map((p) => p.session));
  const lines: ReceiptLine[] = parts.flatMap((p) => {
    const m = byId.get(p.matchupId);
    if (!m || !m.sides.some((s) => s.id === p.sideId)) return [];
    return [{ matchupId: m.id, slug: m.slug, title: m.title, sides: m.sides, sideId: p.sideId, pulls: p.pulls, totalA: m.round?.total_a_cents ?? 0, totalB: m.round?.total_b_cents ?? 0, pull: pulls.get(p.session) ?? null }];
  });
  return { amountCents: order.expected_cents, pulls: order.quantity, refundedPulls: Math.floor(order.basket_refund_cents / 100), lines, siteUrl: config().siteUrl || "https://tugg.lol" };
}

/** Public pull ids and their snapshot totals only; the session key is used for lookup and never returned. */
async function recordedPulls(db: SupabaseClient<any>, sessions: string[]): Promise<Map<string, ReceiptPull>> {
  if (!sessions.length) return new Map();
  const { data, error } = await db.from("pulls").select("id,stripe_session_id,round_a_after_cents,round_b_after_cents").in("stripe_session_id", sessions);
  // The share card is a bonus: a failed lookup falls back to the live matchup card, never hides the receipt.
  if (error) return new Map();
  return new Map((data ?? []).filter((p: any) => p.round_a_after_cents != null && p.round_b_after_cents != null)
    .map((p: any) => [p.stripe_session_id, { id: p.id, totalA: Number(p.round_a_after_cents), totalB: Number(p.round_b_after_cents) }]));
}
